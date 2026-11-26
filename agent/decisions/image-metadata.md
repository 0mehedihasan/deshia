# Decision: original-image metadata

DeshiA will describe the original imported file using Sharp header metadata and a streaming SHA-256 over the original bytes. It will not normalize resolution by resizing/recompressing/cropping, nor will it substitute preview dimensions. The existing SQLite image entity is extended for MIME/color/extraction state; exact resolution/aspect/pixel distributions are derived at report time. Metadata paths in exports are workspace-relative to avoid leaking machine-specific absolute paths.

Migration `0003_add_image_metadata` is additive. Existing records receive a pending extraction state and are populated by bounded retryable actions. A source whose current checksum differs from the imported checksum is marked failed for review, with stored annotations and original metadata preserved.
