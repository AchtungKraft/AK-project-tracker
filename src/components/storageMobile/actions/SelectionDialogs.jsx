import PhotoOrganizeDialogs from "@/components/inventory/photos/organize/PhotoOrganizeDialogs";
import ContentMoveDialog from "../move/ContentMoveDialog";

const ORGANIZE = { group: 'group', individual: 'separate', separate: 'separate', details: 'details', identify: 'identify' };

/**
 * The canonical workflows behind a selection action. Every screen opens the same dialogs:
 * organizing goes through storagePhotoOrganize, physical moves through storageContentMove.
 */
export default function SelectionDialogs({ tote, dialog, photos, moveEntries, movePhotos, onClose, onDone }) {
  if (!dialog) return null;
  if (dialog === 'move') {
    if (!moveEntries.length && !movePhotos.length) return null;
    return <ContentMoveDialog source={tote} entries={moveEntries} photos={movePhotos} onClose={onClose} onMoved={onDone} />;
  }
  const mode = ORGANIZE[dialog];
  if (!mode || !photos.length) return null;
  return <PhotoOrganizeDialogs key={dialog} containerId={tote.id} dialog={mode} photos={photos} onClose={onClose} onDone={onDone} />;
}