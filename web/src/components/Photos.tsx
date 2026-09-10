import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Alert, Modal } from './ui';

/**
 * PHOTOS OF A CAR.
 *
 * The arrival photos are the ones that matter: weeks later, when a supplier or
 * a shipper says the car left him in perfect condition, they are the only
 * answer. So the kind of photo is chosen when it is uploaded, not guessed
 * afterwards, and arrival photos on a sold car cannot be removed.
 */

export type PhotoKind = 'PURCHASE' | 'ARRIVAL' | 'REPAIR' | 'SHOWROOM';

export interface Photo {
  id: number;
  carId: number;
  fileName: string;
  kind: PhotoKind;
  caption: string | null;
  bytes: number;
  createdAt: string;
}

export const PHOTO_KINDS: { value: PhotoKind; label: string; help: string }[] = [
  { value: 'PURCHASE', label: 'When bought', help: 'How the car looked at the supplier' },
  { value: 'ARRIVAL', label: 'On arrival', help: 'Damage evidence — keep these' },
  { value: 'REPAIR', label: 'Repair', help: 'Work done in the garage' },
  { value: 'SHOWROOM', label: 'For selling', help: 'The photos a buyer sees' },
];

export const photoUrl = (photo: { fileName: string }) => `/api/photos/file/${photo.fileName}`;

export function PhotoGallery({ carId, sold }: { carId: number; sold?: boolean }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<PhotoKind>('SHOWROOM');
  const [viewing, setViewing] = useState<Photo | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = () =>
    api
      .get<Photo[]>(`/api/cars/${carId}/photos`)
      .then(setPhotos)
      .catch((e) => setError(e.message));

  useEffect(() => {
    void load();
  }, [carId]);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      // One at a time: the server takes one file per request, and a failure on
      // the third photo should not lose the first two.
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append('kind', kind);
        body.append('photo', file, file.name);
        const response = await fetch(`/api/cars/${carId}/photos`, {
          method: 'POST',
          credentials: 'same-origin',
          body,
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text ? (JSON.parse(text).error ?? 'Upload failed') : 'Upload failed');
        }
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (photo: Photo) => {
    if (!confirm('Delete this photo?')) return;
    try {
      await api.del(`/api/photos/${photo.id}`);
      setViewing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete it');
    }
  };

  return (
    <div>
      {error && <Alert kind="error">{error}</Alert>}

      <div className="row" style={{ marginBottom: 10 }}>
        <div className="field" style={{ marginBottom: 0, flex: '0 1 200px' }}>
          <label>These photos are</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as PhotoKind)}>
            {PHOTO_KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="actions">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={(e) => void upload(e.target.files)}
            style={{ display: 'none' }}
          />
          <button type="button" className="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? 'Uploading…' : 'Add photos'}
          </button>
        </div>
      </div>
      <div className="small muted" style={{ marginBottom: 10 }}>
        {PHOTO_KINDS.find((k) => k.value === kind)?.help}. JPG, PNG or WEBP, up to 8 MB each.
      </div>

      {photos === null ? (
        <div className="small muted">Loading photos…</div>
      ) : photos.length === 0 ? (
        <div className="small muted">No photos yet. Take a few on arrival — they settle arguments later.</div>
      ) : (
        <div className="photo-grid">
          {photos.map((photo) => (
            <button key={photo.id} type="button" className="photo-tile" onClick={() => setViewing(photo)}>
              <img src={photoUrl(photo)} alt={photo.caption ?? 'Car photo'} loading="lazy" />
              <span className="photo-kind">{PHOTO_KINDS.find((k) => k.value === photo.kind)?.label ?? photo.kind}</span>
            </button>
          ))}
        </div>
      )}

      {viewing && (
        <Modal title={PHOTO_KINDS.find((k) => k.value === viewing.kind)?.label ?? 'Photo'} onClose={() => setViewing(null)} wide>
          <img src={photoUrl(viewing)} alt={viewing.caption ?? 'Car photo'} style={{ width: '100%', borderRadius: 8 }} />
          <CaptionEditor
            photo={viewing}
            onSaved={(updated) => {
              setViewing(updated);
              void load();
            }}
          />
          <div className="modal-actions">
            <button
              type="button"
              className="danger"
              disabled={sold && viewing.kind === 'ARRIVAL'}
              onClick={() => void remove(viewing)}
            >
              {sold && viewing.kind === 'ARRIVAL' ? 'Kept as evidence' : 'Delete'}
            </button>
            <button type="button" className="secondary" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CaptionEditor({ photo, onSaved }: { photo: Photo; onSaved: (photo: Photo) => void }) {
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCaption(photo.caption ?? '');
    setSaved(false);
  }, [photo.id]);

  return (
    <div className="field" style={{ marginTop: 12 }}>
      <label>Note on this photo</label>
      <div className="row">
        <input
          value={caption}
          placeholder="Dent on the rear left door"
          onChange={(e) => {
            setCaption(e.target.value);
            setSaved(false);
          }}
        />
        <div className="actions">
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              const updated = await api.patch<Photo>(`/api/photos/${photo.id}`, { caption });
              setSaved(true);
              onSaved(updated);
            }}
          >
            {saved ? 'Saved' : 'Save note'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The one photo that stands for a car in a list. */
export function PhotoThumb({ photo, size = 54 }: { photo: { fileName: string } | null; size?: number }) {
  if (!photo)
    return (
      <div className="photo-thumb empty" style={{ width: size, height: size }} aria-hidden="true">
        —
      </div>
    );
  return <img className="photo-thumb" src={photoUrl(photo)} alt="" style={{ width: size, height: size }} loading="lazy" />;
}
