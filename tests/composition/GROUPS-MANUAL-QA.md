# Editor groups — manual check

Use the branch/preview for the PR stacked on #154. This checks group organization and persistence; coverage masks arrive separately.

1. Create a background, a photo, and a halftone effect above the photo. Select the photo and halftone with Cmd/Ctrl-click, then use **Group selected layers** in the Layers header (or Cmd/Ctrl+G). The effect should affect the photo; the background stays outside the group. A layer added while the group is selected should enter that group.
2. Double-click the group name to rename it. Collapse/expand its chevron; hide/show it and adjust its opacity and Blend in Properties. Children retain their own visibility/opacity settings.
3. Drag the group handle past another root layer. Its children should travel with it. Reorder children inside the group; use the **Group** selector in Properties to move a layer into/out of a group. **Move up/down** in the layer menu also supports reordering without dragging.
4. Duplicate the group, delete the copy, and undo/redo. Try **Ungroup** in its menu (or Cmd/Ctrl+Shift+G). Undo should restore the group and its children. Ungroup removes the group's own opacity/blend/visibility contribution, so its appearance can change.
5. Save a `.lab` file, reopen it, and compare group names, order, collapse state, visibility, opacity, and any animated child/group properties. Export PNG and compare it with the preview. If using shader export, the config should retain group layers and child `parentId` references.
6. On mobile, open Layers, scroll to the group, collapse/expand it, then use Properties to change opacity or membership.

Limits: eight group levels; grouping selections must share a parent (selecting a group also selects its subtree for group/duplicate/delete operations). Dragging reorders siblings; moving between groups uses Properties. New saves use project version 7 and need this V3 build to reopen; older projects remain supported. Group masks and transparent scene/export backgrounds are separate work.
