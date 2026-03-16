import React, { useState, useRef, useCallback, useEffect } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * JournalRichEditor - WYSIWYG HTML editor for journal entries.
 * 
 * Key stability fixes:
 * - Imports quill.snow.css (required for Chrome/Mac editing)
 * - Uses refs for handlers to keep modules object stable (prevents Quill re-init)
 * - Paste image handling done via Quill's clipboard matchers, not wrapper onPaste
 * - Drop handler only intercepts file drops, not text
 */

const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'code-block'],
  ['link', 'image', 'insertTable'],
  [{ align: [] }],
  ['clean'],
];

export default function JournalRichEditor({ value, onChange, placeholder }) {
  const [uploading, setUploading] = useState(false);
  const quillRef = useRef(null);
  const dropZoneRef = useRef(null);
  const dragCounterRef = useRef(0);
  
  // Use refs for upload/insert so modules object stays stable
  const uploadFileRef = useRef(null);
  const insertImageRef = useRef(null);

  // Upload a file and return the URL
  const uploadFile = useCallback(async (file) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are supported');
      return null;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)');
      return null;
    }
    
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      return file_url;
    } catch (err) {
      toast.error('Failed to upload image');
      console.error('Upload error:', err);
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  // Insert image at cursor position in the editor
  const insertImage = useCallback((url) => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;
    const range = quill.getSelection(true);
    quill.insertEmbed(range.index, 'image', url);
    quill.setSelection(range.index + 1);
  }, []);

  // Keep refs current
  uploadFileRef.current = uploadFile;
  insertImageRef.current = insertImage;

  // Set up paste image handling via Quill's clipboard matchers ONCE
  useEffect(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    // Listen to native paste on the editor root to catch image pastes
    const editorRoot = quill.root;
    
    const handleEditorPaste = async (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find(i => i.type.startsWith('image/'));
      
      // Only intercept if there's an image file AND no text content
      // This ensures normal text paste is never blocked
      if (imageItem && !e.clipboardData?.getData('text/plain') && !e.clipboardData?.getData('text/html')) {
        e.preventDefault();
        e.stopPropagation();
        const file = imageItem.getAsFile();
        if (file) {
          const url = await uploadFileRef.current(file);
          if (url) {
            insertImageRef.current(url);
          }
        }
      }
      // For all other pastes (text, html, mixed), let Quill handle natively
    };

    editorRoot.addEventListener('paste', handleEditorPaste);
    return () => {
      editorRoot.removeEventListener('paste', handleEditorPaste);
    };
  }, []);

  // Drag counter approach: prevents flickering on nested elements
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      dropZoneRef.current?.classList.add('ring-2', 'ring-red-500/50');
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      dropZoneRef.current?.classList.remove('ring-2', 'ring-red-500/50');
    }
  }, []);

  // Handle drop — only intercept file drops, let Quill handle text drops
  const handleDrop = useCallback(async (e) => {
    dragCounterRef.current = 0;
    dropZoneRef.current?.classList.remove('ring-2', 'ring-red-500/50');
    
    const files = Array.from(e.dataTransfer?.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    
    // Only prevent default if we have image files to handle
    if (imageFiles.length === 0) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    for (const file of imageFiles) {
      const url = await uploadFileRef.current(file);
      if (url) {
        insertImageRef.current(url);
      }
    }
  }, []);

  // Stable modules object — handlers use refs so this never needs to change
  const modules = React.useMemo(() => ({
    toolbar: {
      container: TOOLBAR_OPTIONS,
      handlers: {
        image: () => {
          const input = document.createElement('input');
          input.setAttribute('type', 'file');
          input.setAttribute('accept', 'image/*');
          input.setAttribute('multiple', 'true');
          input.click();
          
          input.onchange = async () => {
            const files = Array.from(input.files || []);
            for (const file of files) {
              const url = await uploadFileRef.current(file);
              if (url) {
                insertImageRef.current(url);
              }
            }
          };
        },
        insertTable: () => {
          const quill = quillRef.current?.getEditor();
          if (!quill) return;
          const range = quill.getSelection(true);
          const tableHtml = '<table><thead><tr><th>Header 1</th><th>Header 2</th><th>Header 3</th></tr></thead><tbody><tr><td>Cell 1</td><td>Cell 2</td><td>Cell 3</td></tr><tr><td>Cell 4</td><td>Cell 5</td><td>Cell 6</td></tr></tbody></table><p><br></p>';
          quill.clipboard.dangerouslyPasteHTML(range.index, tableHtml);
        },
      },
    },
  }), []); // Empty deps — handlers use refs, so this is stable forever

  return (
    <div 
      ref={dropZoneRef}
      className="relative rounded-lg transition-all"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Upload overlay */}
      {uploading && (
        <div className="absolute inset-0 bg-black/60 z-10 flex items-center justify-center rounded-lg pointer-events-none">
          <div className="flex items-center gap-2 text-white bg-gray-800 px-4 py-2 rounded-lg">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Uploading image...</span>
          </div>
        </div>
      )}
      
      <style>{`
        .journal-editor .ql-toolbar {
          background: rgb(31, 41, 55);
          border-color: rgb(55, 65, 81);
          border-radius: 0.5rem 0.5rem 0 0;
        }
        .journal-editor .ql-toolbar .ql-stroke {
          stroke: rgb(156, 163, 175);
        }
        .journal-editor .ql-toolbar .ql-fill {
          fill: rgb(156, 163, 175);
        }
        .journal-editor .ql-toolbar .ql-picker-label {
          color: rgb(156, 163, 175);
        }
        .journal-editor .ql-toolbar button:hover .ql-stroke,
        .journal-editor .ql-toolbar button.ql-active .ql-stroke {
          stroke: rgb(248, 113, 113);
        }
        .journal-editor .ql-toolbar button:hover .ql-fill,
        .journal-editor .ql-toolbar button.ql-active .ql-fill {
          fill: rgb(248, 113, 113);
        }
        .journal-editor .ql-toolbar .ql-picker-label:hover,
        .journal-editor .ql-toolbar .ql-picker-label.ql-active {
          color: rgb(248, 113, 113);
        }
        .journal-editor .ql-container {
          background: rgb(31, 41, 55);
          border-color: rgb(55, 65, 81);
          border-radius: 0 0 0.5rem 0.5rem;
          color: white;
          min-height: 200px;
          font-size: 0.95rem;
        }
        .journal-editor .ql-editor {
          min-height: 200px;
          color: rgb(229, 231, 235);
          line-height: 1.7;
        }
        .journal-editor .ql-editor.ql-blank::before {
          color: rgb(107, 114, 128);
          font-style: normal;
        }
        .journal-editor .ql-editor h1 { font-size: 1.5em; font-weight: 700; margin: 0.5em 0 0.25em; color: white; }
        .journal-editor .ql-editor h2 { font-size: 1.25em; font-weight: 600; margin: 0.5em 0 0.25em; color: white; }
        .journal-editor .ql-editor h3 { font-size: 1.1em; font-weight: 600; margin: 0.5em 0 0.25em; color: white; }
        .journal-editor .ql-editor blockquote {
          border-left: 3px solid rgb(127, 29, 29);
          padding-left: 1em;
          color: rgb(156, 163, 175);
          margin: 0.5em 0;
        }
        .journal-editor .ql-editor pre {
          background: rgb(17, 24, 39);
          border-radius: 0.375rem;
          padding: 0.75em;
          color: rgb(167, 243, 208);
          font-family: monospace;
        }
        .journal-editor .ql-editor img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 0.5em 0;
        }
        .journal-editor .ql-editor a {
          color: rgb(248, 113, 113);
          text-decoration: underline;
        }
        .journal-editor .ql-editor table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.5em 0;
        }
        .journal-editor .ql-editor table td,
        .journal-editor .ql-editor table th {
          border: 1px solid rgb(55, 65, 81);
          padding: 0.5em;
        }
        .journal-editor .ql-snow .ql-picker-options {
          background: rgb(31, 41, 55);
          border-color: rgb(55, 65, 81);
        }
        .journal-editor .ql-snow .ql-picker-item {
          color: rgb(209, 213, 219);
        }
        .journal-editor .ql-snow .ql-picker-item:hover {
          color: white;
        }
        .journal-editor .ql-snow .ql-tooltip {
          background: rgb(31, 41, 55);
          border-color: rgb(55, 65, 81);
          color: white;
          box-shadow: 0 4px 6px rgba(0,0,0,0.3);
          z-index: 20;
        }
        .journal-editor .ql-snow .ql-tooltip input[type=text] {
          background: rgb(17, 24, 39);
          border-color: rgb(55, 65, 81);
          color: white;
        }
        .journal-editor .ql-snow .ql-tooltip a {
          color: rgb(248, 113, 113);
        }
        /* Table insert button styling */
        .journal-editor .ql-insertTable {
          width: 28px !important;
          height: 24px !important;
          position: relative;
        }
        .journal-editor .ql-insertTable::after {
          content: '⊞';
          font-size: 16px;
          color: rgb(156, 163, 175);
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        .journal-editor .ql-insertTable:hover::after {
          color: rgb(248, 113, 113);
        }
        /* Ensure Quill clipboard/selection works on all platforms */
        .journal-editor .ql-clipboard {
          position: fixed !important;
          left: -100000px !important;
          top: 50% !important;
        }
      `}</style>
      
      <div className="journal-editor">
        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={value || ''}
          onChange={onChange}
          modules={modules}
          placeholder={placeholder || "Write your journal entry..."}
        />
      </div>
    </div>
  );
}