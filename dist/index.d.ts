import type { QuartzTransformerPlugin } from "@quartz-community/types"

export interface PhotoViewOptions {
  /** Frontmatter key that turns on the "Filmstrip view" button for a page. Default "filmstrip". */
  frontmatterKey: string
}

export declare const PhotoView: QuartzTransformerPlugin<Partial<PhotoViewOptions>>
export default PhotoView
