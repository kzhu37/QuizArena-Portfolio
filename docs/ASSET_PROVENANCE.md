# Visual Asset Provenance

This page documents how the visual material used by Quizler Arena was prepared. It separates interface implementation from image generation and avoids presenting AI-assisted or externally influenced visual material as hand-illustrated original artwork.

## Application visuals

The interface layout, component composition, interaction behavior, responsive placement, visual layering, fallback behavior, and asset integration are project implementation work.

The visual asset workflow also included **AI-assisted image generation during development, including Gemini image generation**, followed by manual selection, editing, cropping, transparency cleanup, filename normalization, staging, and integration into the application. Exact per-file generation history was not retained for every image, so this repository does not claim a more specific origin than the evidence supports.

| Path | Use | Provenance and project work |
| --- | --- | --- |
| `public/assets/backgrounds/` | Lobby, loading, Wordle, and shared scene backgrounds | Project-specific visual pack prepared through the development asset workflow. Some visual generation was AI-assisted. Images were selected, edited, normalized, and integrated for the final interface. |
| `public/assets/quizzler/` | Quizler character poses used throughout the platform | Project-specific character asset set prepared through the same AI-assisted and manual editing workflow, then mapped through the centralized asset registry. |
| `public/assets/hangman/` | Staged Hangman backgrounds and outcome imagery | Project-specific staged image sequence prepared and integrated for deterministic stage progression. Manual work included filename normalization, stage ordering, fallback handling, and layer behavior. |

Because exact generation history varies across files, the folders above are treated as application media rather than as a standalone reusable art pack.

## Documentation visuals

| Path | Use | Provenance |
| --- | --- | --- |
| `docs/media/*.webp` | README product screenshots | Captures of the real production application produced through the repository's capture tooling, then optimized to WebP for GitHub presentation. They are not interface mockups. |
| `docs/diagrams/*.svg` | Architecture, board assembly, and content pipeline diagrams | Original documentation diagrams created specifically to explain verified implementation and project decisions. |

## Asset reliability work

Visual assets became an engineering problem as the platform grew. Replacing images could break filenames, cached fallbacks, stage order, or visual layering. The final implementation therefore centralizes asset mappings in [`src/platform/assets.ts`](../src/platform/assets.ts), renders through [`AssetLayer.tsx`](../src/platform/AssetLayer.tsx), and keeps explicit Hangman stage ordering rather than relying on implicit filenames.

This provenance record is about presentation accuracy. It does not grant additional rights to any third-party material that may be incorporated into an image beyond the rights provided by its original source or tool terms.
