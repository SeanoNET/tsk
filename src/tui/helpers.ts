import type { Renderable } from "@opentui/core";

/** Remove all children from a renderable */
export function removeAllChildren(parent: Renderable): void {
  for (const child of parent.getChildren()) {
    parent.remove(child.id);
  }
}
