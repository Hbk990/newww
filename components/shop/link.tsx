import type {ComponentProps} from 'react';

// vinext 1.0.0-beta.5 ships a broken client router. `next/link` cancels the
// browser's own navigation and then throws "TypeError: e is not a function"
// inside startTransition, so every link on the site swallows the click and goes
// nowhere. These render ordinary anchors and let the browser navigate.
//
// Nothing is lost by it: every page here is `force-dynamic` and server-rendered
// per request, so client-side routing was only saving a repaint. When vinext
// fixes its router, this file is the single place to switch back.

export function Link({href,children,...rest}:{href:string}&Omit<ComponentProps<'a'>,'href'>){
 return <a href={href} {...rest}>{children}</a>;
}

export function navigate(href:string){
 window.location.assign(href);
}
