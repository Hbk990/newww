import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { CarStatus, PartyType } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/db.js';
import { atomic } from '../src/lib/atomic.js';
import { reverseEntryInTransaction } from '../src/services/ledger.js';
import { consumeRecoveryCode, hashPassword } from '../src/lib/auth.js';

let app: FastifyInstance, cookie: string, userId: number;
let serial = 0;
const suffix = Date.now().toString();
async function request(method: 'GET' | 'POST' | 'DELETE' | 'PATCH', url: string, payload?: object) {
  return app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
}
async function ok(method: 'GET' | 'POST' | 'DELETE' | 'PATCH', url: string, payload?: object) {
  const result = await request(method, url, payload);
  expect(result.statusCode, result.body).toBe(200);
  return result.json();
}
async function party(type: PartyType) {
  return prisma.party.create({ data: { name: `Regression ${suffix} ${++serial}`, type,
    currency: type === 'CAR_SUPPLIER' || type === 'SHIPPING_COMPANY' ? 'USD' : 'XOF',
    ...(type === 'CAR_SUPPLIER' ? { country: 'USA' as const } : {}),
    ...(type === 'WORKER' ? { workerRole: 'GARAGE' as const } : {}),
  } });
}
async function car(status: CarStatus = 'PURCHASED') {
  const supplier = await party('CAR_SUPPLIER');
  return prisma.car.create({ data: { supplierId: supplier.id, makeName: 'Test', modelName: 'Regression',
    year: 2020, color: 'White', vin: `TEST${suffix.slice(-7)}${String(++serial).padStart(6,'0')}`,
    purchasePriceUsd: 1000, purchaseDate: new Date('2026-05-01'), status,
    ...(!['PURCHASED','SHIPPED','SOLD_IN_ORIGIN'].includes(status) ? {
      arrivalCostCfa: 600000, cfaRate: 600, purchaseCfa: 600000, originExpensesCfa: 0,
      freightCfa: 0, taxCapitalizedCfa: 0, arrivedAt: new Date('2026-05-02'),
    } : {}),
  } });
}
async function shipment(cars: number[]) {
  const shipper = await party('SHIPPING_COMPANY');
  return ok('POST', '/api/shipments', { reference: `R-${++serial}`, shippingCompanyId: shipper.id,
    freightCostUsd: 100, carIds: cars });
}
const saleInput = { price: 1000000, buyerName: 'Regression buyer', saleDate: '2026-05-10' };
beforeAll(async () => {
  const password = 'Regression-Password-2026!';
  const user = await prisma.user.create({ data: { username: 'regression-'+suffix, passwordHash: await hashPassword(password) } });
  userId = user.id; app = await buildApp(); await app.ready();
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: user.username, password } });
  expect(login.statusCode).toBe(200); cookie = login.headers['set-cookie']!.toString().split(';')[0];
}, 30000);
afterAll(async () => { await app?.close(); await prisma.$disconnect(); });

describe('shipment integrity', () => {
  it('cannot detach a sold car using an unrelated draft shipment', async () => {
    const target = await car('SHOWROOM'); const owned = await shipment([]);
    await prisma.car.update({ where: { id: target.id }, data: { shipmentId: owned.id } });
    await ok('POST', `/api/cars/${target.id}/sell`, saleInput);
    const unrelated = await shipment([]);
    const before = await prisma.car.findUniqueOrThrow({ where: { id: target.id } });
    const result = await request('DELETE', `/api/shipments/${unrelated.id}/cars/${target.id}`);
    expect(result.statusCode).toBe(400);
    expect(await prisma.car.findUnique({ where: { id: target.id } })).toEqual(before);
  });
  it('rejects duplicate shares even if the supplied amounts total the invoice', async () => {
    const a = await car(), b = await car(); const s = await shipment([a.id,b.id]);
    const result = await request('POST', `/api/shipments/${s.id}/shares`, { shares: [
      { carId:a.id, amountUsd:25 },{ carId:a.id, amountUsd:25 },{ carId:b.id, amountUsd:50 },
    ] });
    expect(result.statusCode).toBe(400);
    const rows = await prisma.car.findMany({ where: { shipmentId:s.id } });
    expect(rows.map(c=>c.freightShareUsd!.toString())).toEqual(['50','50']);
  });
  it('removes the correct car and resplits the remaining load', async () => {
    const a=await car(), b=await car(); const s=await shipment([a.id,b.id]);
    await ok('DELETE',`/api/shipments/${s.id}/cars/${a.id}`);
    expect(await prisma.car.findUnique({where:{id:a.id}})).toMatchObject({shipmentId:null,status:'PURCHASED'});
    expect((await prisma.car.findUniqueOrThrow({where:{id:b.id}})).freightShareUsd!.toString()).toBe('100');
  });
  it('posts only one freight invoice under simultaneous arrival requests', async () => {
    const a=await car();const s=await shipment([a.id]);
    const responses=await Promise.all([600,610].map(cfaRate=>request('POST',`/api/shipments/${s.id}/arrive`,{cfaRate})));
    expect(responses.map(r=>r.statusCode).sort()).toEqual([200,400]);
    const entries=await prisma.ledgerEntry.findMany({where:{shipmentId:s.id,kind:'FREIGHT_INVOICE'}});
    expect(entries).toHaveLength(1);expect(entries[0].amount.toString()).toBe('100');
    const landed=await prisma.car.findUniqueOrThrow({where:{id:a.id}});
    const arrived=await prisma.shipment.findUniqueOrThrow({where:{id:s.id}});
    expect(landed.cfaRate!.eq(arrived.cfaRate!)).toBe(true);
  });
  it('updates the status when a car is added to an already shipped load', async () => {
    const a=await car(), b=await car();const s=await shipment([a.id]);
    await ok('POST',`/api/shipments/${s.id}/ship`);
    await ok('POST',`/api/shipments/${s.id}/cars`,{carIds:[b.id]});
    expect((await prisma.car.findUniqueOrThrow({where:{id:b.id}})).status).toBe('SHIPPED');
  });
});

describe('sale settlement',()=>{
  it('rejects an initial overpayment without creating a sale or changing stock',async()=>{
    const c=await car('SHOWROOM');const r=await request('POST',`/api/cars/${c.id}/sell`,{...saleInput,initialPayment:1000001});
    expect(r.statusCode).toBe(400);expect(await prisma.sale.count({where:{carId:c.id}})).toBe(0);
    expect((await prisma.car.findUniqueOrThrow({where:{id:c.id}})).status).toBe('SHOWROOM');
  });
  it('allows an exact initial payment and settles the customer account',async()=>{
    const c=await car('SHOWROOM'), customer=await party('CUSTOMER');
    const result=await ok('POST',`/api/cars/${c.id}/sell`,{...saleInput,customerId:customer.id,initialPayment:1000000});
    const rows=await ok('GET','/api/sales');expect(rows.find((s:{id:number})=>s.id===result.sale.id)).toMatchObject({paid:'1000000',remaining:'0'});
    const balance=await prisma.ledgerEntry.aggregate({where:{partyId:customer.id},_sum:{amount:true}});
    expect(balance._sum.amount!.toString()).toBe('0');
  });
  it('settles a USD origin sale including cents and rejects a second collection',async()=>{
    const c=await car();const {sale}=await ok('POST',`/api/cars/${c.id}/sell`,{...saleInput,channel:'ORIGIN',price:1500.25});
    const rows=await ok('GET','/api/sales');expect(rows.find((s:{id:number})=>s.id===sale.id)).toMatchObject({paid:'1500.25',remaining:'0'});
    const r=await request('POST',`/api/sales/${sale.id}/payments`,{amount:1500.25,date:'2026-05-11'});
    expect(r.statusCode).toBe(400);expect(await prisma.salePayment.count({where:{saleId:sale.id}})).toBe(0);
    const charge=await prisma.ledgerEntry.findFirstOrThrow({where:{saleId:sale.id,kind:'ORIGIN_SALE_PROCEEDS'}});
    expect(charge.amount.toString()).toBe('-1500.25');
    expect((await request('POST',`/api/cars/${c.id}/origin-expenses`,{amountUsd:10})).statusCode).toBe(400);
  });
  it('cannot overpay through simultaneous instalments',async()=>{
    const c=await car('SHOWROOM'),customer=await party('CUSTOMER');
    const {sale}=await ok('POST',`/api/cars/${c.id}/sell`,{...saleInput,customerId:customer.id,initialPayment:999900});
    const replies=await Promise.all([1,2].map(()=>request('POST',`/api/sales/${sale.id}/payments`,{amount:80,date:'2026-05-11'})));
    expect(replies.map(r=>r.statusCode).sort()).toEqual([200,400]);
    const amounts=await prisma.salePayment.aggregate({where:{saleId:sale.id},_sum:{amount:true}});
    expect(amounts._sum.amount!.toString()).toBe('999980');
    const balance=await prisma.ledgerEntry.aggregate({where:{partyId:customer.id},_sum:{amount:true}});
    expect(balance._sum.amount!.toString()).toBe('20');
  });
});

describe('repair charge provenance and history',()=>{
  for(const type of ['jobs','parts'] as const){
    it(`deletes equal-cost ${type} independently and reverses their exact charges`,async()=>{
      const c=await car('IN_GARAGE'),p=await party(type==='jobs'?'WORKER':'PARTS_SUPPLIER');
      const input=type==='jobs'?{workerId:p.id,serviceType:'PAINTER',labourCostCfa:100}:{partsSupplierId:p.id,description:'Bumper',costCfa:100};
      const a=await ok('POST',`/api/cars/${c.id}/repairs/${type}`,input),b=await ok('POST',`/api/cars/${c.id}/repairs/${type}`,input);
      expect(a.ledgerEntryId).not.toBe(b.ledgerEntryId);
      await ok('DELETE',`/api/repairs/${type}/${a.id}`);await ok('DELETE',`/api/repairs/${type}/${b.id}`);
      const reversed=await prisma.ledgerEntry.findMany({where:{reversesId:{in:[a.ledgerEntryId,b.ledgerEntryId]}}});expect(reversed).toHaveLength(2);
      const balance=await prisma.ledgerEntry.aggregate({where:{partyId:p.id},_sum:{amount:true}});expect(balance._sum.amount!.toString()).toBe('0');
    });
    it(`locks ${type} after sale and preserves the reported cost`,async()=>{
      const c=await car('IN_GARAGE'),p=await party(type==='jobs'?'WORKER':'PARTS_SUPPLIER');
      const input=type==='jobs'?{workerId:p.id,serviceType:'PAINTER',labourCostCfa:100}:{partsSupplierId:p.id,description:'Bumper',costCfa:100};
      const repair=await ok('POST',`/api/cars/${c.id}/repairs/${type}`,input);
      await ok('POST',`/api/cars/${c.id}/repairs/finish`);await ok('POST',`/api/cars/${c.id}/sell`,saleInput);
      expect((await request('DELETE',`/api/repairs/${type}/${repair.id}`)).statusCode).toBe(400);
      const after=await ok('GET',`/api/cars/${c.id}`);expect(after.costs.landedCostCfa).toBe('600100');
      expect(await prisma.ledgerEntry.count({where:{reversesId:repair.ledgerEntryId}})).toBe(0);
    });
  }
  it('rolls back the ledger reversal when deleting the repair fails',async()=>{
    const c=await car('IN_GARAGE'),p=await party('WORKER');
    const job=await ok('POST',`/api/cars/${c.id}/repairs/jobs`,{workerId:p.id,serviceType:'PAINTER',labourCostCfa:100});
    await expect(atomic(async tx => {
      await reverseEntryInTransaction(tx, job.ledgerEntryId, 'Rollback regression', userId);
      await tx.repairJob.delete({ where: { id: -1 } }); // fails after the reversal was written
    })).rejects.toThrow();
    expect(await prisma.repairJob.count({where:{id:job.id}})).toBe(1);
    expect(await prisma.ledgerEntry.count({where:{reversesId:job.ledgerEntryId}})).toBe(0);
  });
  it('refuses to guess a charge for ambiguous older repair records',async()=>{
    const c=await car('IN_GARAGE'),p=await party('WORKER');
    const input={workerId:p.id,serviceType:'PAINTER',labourCostCfa:100};
    const a=await ok('POST',`/api/cars/${c.id}/repairs/jobs`,input);await ok('POST',`/api/cars/${c.id}/repairs/jobs`,input);
    await prisma.repairJob.updateMany({where:{carId:c.id},data:{ledgerEntryId:null}});
    expect((await request('DELETE',`/api/repairs/jobs/${a.id}`)).statusCode).toBe(409);
    expect(await prisma.repairJob.count({where:{carId:c.id}})).toBe(2);
  });
});

describe('recovery codes',()=>{
  it('allows exactly one concurrent use and refuses replay',async()=>{
    const code='ABCDE-12345';await prisma.recoveryCode.create({data:{userId,codeHash:await hashPassword(code)}});
    const results=await Promise.all([consumeRecoveryCode(userId,code),consumeRecoveryCode(userId,code)]);
    expect(results.sort()).toEqual([false,true]);expect(await consumeRecoveryCode(userId,code)).toBe(false);
  });
});

describe('vehicle lookup stays local',()=>{
  it('looks up saved makes and models while external fetch is unavailable',async()=>{
    const make=await prisma.carMake.upsert({where:{name:'OfflineBrand'},create:{name:'OfflineBrand'},update:{}});
    await prisma.carModel.upsert({where:{makeId_name:{makeId:make.id,name:'OfflineSUV'}},create:{makeId:make.id,name:'OfflineSUV'},update:{}});
    const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('offline'));
    try{
      expect((await ok('GET','/api/vehicles/makes?q=OfflineBrand')).some((r:{id:number})=>r.id===make.id)).toBe(true);
      expect((await ok('GET',`/api/vehicles/models?makeId=${make.id}`))[0].name).toBe('OfflineSUV');
      expect(fetch).not.toHaveBeenCalled();
    }finally{fetch.mockRestore()}
  });
});
