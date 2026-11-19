# quartz-photo-view

A [Quartz](https://quartz.jzhao.xyz) v5 plugin for pages with lots of images.

- **Lightbox** — click an image in a note to see it full size. Step through
  every image on the page with ← / →, swipe, or on-screen arrows; Esc or a
  click closes it.
- **Filmstrip view** — on pages you choose, a *Filmstrip view* button shows
  every photo at full screen height in one sideways-scrolling row. The mouse
  wheel and arrow keys scroll it; Esc or the hand ""X" button closes it.

The filmstrip is **opt-in for visitors**, until someone clicks
the button, nothing changes. Their choice is remembered in their own browser, they get the
filmstrip on photo pages until they close it again.

Works with Quartz's SPA navigation. No dependencies or build step.

## Quick n dirty "what it looks like"
<table>
  <tr>
    <th>Desktop</th>
    <th>Mobile</th>
  </tr>
  <tr>
    <td><img src="media/desktop.gif" alt="Desktop: clicking photos opens the lightbox, stepping through with the arrows, then scrolling the filmstrip view" width="560"></td>
    <td><img src="media/mobile.gif" alt="Mobile: tapping a photo opens it full screen, swiping between photos, then the filmstrip view" width="220"></td>
  </tr>
</table>

Live on [28mm.coffee](https://28mm.coffee/photos/bristol-street-jam-2025).

## Install

```bash
npx quartz plugin add github:Doghouse-Mike/quartz-photo-view
```

or add it to `quartz.config.yaml` yourself, then `npx quartz plugin install`:

```yaml
plugins:
  - source: github:Doghouse-Mike/quartz-photo-view
    enabled: true
    order: 60
```

## Choosing which pages get the filmstrip

Just add `filmstrip: true` to a note's frontmatter:

```yaml
---
title: Bristol Street Jam 2025
filmstrip: true
---
```
<img width="405" height="110" alt="image" src="https://github.com/user-attachments/assets/cc252e91-aa9a-4ae4-a3ec-c8a6c7d3f6ce" />

The button appears on that page if it has at least one image. To use a
different frontmatter key:

```yaml
    options:
      frontmatterKey: gallery
```

## Notes

- The filmstrip lazy-loads, so only the photos near the viewport are fetched.
- The lightbox's `<dialog>` approach comes from
  [vazome/quartz-image-zoom](https://github.com/vazome/quartz-image-zoom) (MIT).
  This version recreates the dialog after SPA navigation, adds prev/next

## Licence

MIT — see [LICENSE](LICENSE).
