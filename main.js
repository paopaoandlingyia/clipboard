import { createClient } from '@supabase/supabase-js';
import Quill from 'quill'; // Import Quill

// --- Toast提示函数 ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        background: ${type === 'success' ? 'linear-gradient(90deg,#22c55e,#16a34a)' : type === 'error' ? 'linear-gradient(90deg,#ef4444,#b91c1c)' : 'linear-gradient(90deg,#2563eb,#38bdf8)'};
        color: #fff;
        padding: 12px 28px;
        border-radius: 24px;
        margin-top: 8px;
        font-size: 1.08rem;
        font-weight: 500;
        box-shadow: 0 2px 12px rgba(37,99,235,0.13);
        opacity: 0;
        transform: translateY(20px);
        transition: opacity 0.3s, transform 0.3s;
        pointer-events: auto;
        display: inline-block;
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => container.removeChild(toast), 300);
    }, 1800);
}

// --- Configuration ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TABLE_NAME = 'clipboard'; // Your table name

// --- Get HTML Elements ---
const statusElement = document.getElementById('status');
// const newItemTextarea = document.getElementById('newItemContent'); // Removed old textarea reference
const editorContainer = document.getElementById('editor-container'); // Get Quill container
const addButton = document.getElementById('addButton');
const clipboardListElement = document.getElementById('clipboardList');

// --- Initialize Quill Editor ---
let quillEditor = null; // Variable to hold the main Quill instance

// --- Initialize Supabase Client ---
let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseAnonKey);
        console.log('Supabase client initialized.');
        statusElement.textContent = 'Supabase client initialized.';
    } catch (error) {
        console.error("Error initializing Supabase:", error);
        statusElement.textContent = `Error initializing Supabase: ${error.message}`;
        if (addButton) addButton.disabled = true;
        if (newItemTextarea) newItemTextarea.disabled = true;
    }
} else {
    console.error('Supabase URL or Anon Key is missing. Check environment variables.');
    statusElement.textContent = 'Error: Supabase URL or Anon Key missing!';
    if (addButton) addButton.disabled = true;
    // if (newItemTextarea) newItemTextarea.disabled = true; // Removed old reference
    // Disable editor if Supabase fails? Quill initialization happens later.
}

// --- State Variable ---
let clipboardItems = []; // To hold the current list of items

// --- Store for item-specific Quill editor instances (only when editing) ---
// REMOVED: const activeItemEditors = {};

// Helper function to render item content (used initially and after exiting edit mode)
// OPTIMIZED: Renders plain text or simple HTML for read-only view, avoids Quill instance per item.
function renderItemContent(container, contentData, itemId) {
    container.innerHTML = ''; // Clear previous content
    try {
        let displayText = '';
        let isHtml = false; // Flag to indicate if we should use innerHTML

        // Check if content is a simple JSON string (likely converted plain text)
        if (typeof contentData === 'string') {
            displayText = contentData;
            const pre = document.createElement('pre');
            pre.textContent = displayText;
            container.appendChild(pre);
        } else if (contentData && typeof contentData === 'object' && Array.isArray(contentData.ops)) {
            // Render Delta: Get plain text representation for display
            // Create a temporary Quill instance *without* a container element
            const tempQuill = new Quill(document.createElement('div')); // Temporary, not added to DOM
            tempQuill.setContents(contentData);
            displayText = tempQuill.getText(); // Get plain text

            // Display plain text within a <pre> tag to preserve line breaks
            const pre = document.createElement('pre');
             // Trim trailing newline often added by getText()
            pre.textContent = displayText.replace(/\n$/, '');
            container.appendChild(pre);

            // --- Optional: Alternative using getSemanticHTML (if available & suitable) ---
            // Note: getSemanticHTML is not a standard Quill API, but demonstrates the idea.
            // If Quill had such a method or you found a library:
            // try {
            //     // Hypothetical: Convert Delta to basic HTML
            //     displayText = convertDeltaToHtml(contentData); // Replace with actual conversion logic/library
            //     isHtml = true;
            // } catch (htmlErr) {
            //     console.warn(`Item ${itemId}: Could not convert Delta to HTML, falling back to text.`, htmlErr);
            //     // Fallback to plain text if HTML conversion fails
            //     const tempQuill = new Quill(document.createElement('div'));
            //     tempQuill.setContents(contentData);
            //     displayText = tempQuill.getText().replace(/\n$/, '');
            //     isHtml = false; // Ensure we use textContent below
            // }
            //
            // if (isHtml) {
            //     container.innerHTML = displayText; // Set as HTML
            // } else {
            //     const pre = document.createElement('pre');
            //     pre.textContent = displayText; // Set as text
            //     container.appendChild(pre);
            // }
            // --- End Optional Alternative ---

        } else {
            console.error(`Item ${itemId}: Unknown content format during render`, contentData);
            const pre = document.createElement('pre');
            pre.textContent = '[Error: Unknown content format]';
            container.appendChild(pre);
        }
    } catch (e) {
        console.error(`Error rendering content for item ${itemId}:`, e, contentData);
        const pre = document.createElement('pre');
        pre.textContent = `[Error rendering content: ${e.message}]`;
        container.appendChild(pre);
    }
}


// --- Function: Render the list of clipboard items ---
// OPTIMIZED: Uses event delegation and simplified rendering, NO EDIT functionality
function renderClipboardList(items) {
    if (!clipboardListElement) return;
    clipboardListElement.innerHTML = ''; // Clear the current list display

    if (items.length === 0) {
        clipboardListElement.innerHTML = '<p>No clipboard items yet.</p>';
        return;
    }

    const fragment = document.createDocumentFragment(); // Use fragment for better performance

    items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'clipboard-item';
        itemDiv.dataset.id = item.id; // Store ID on the main element

        // --- Content Display ---
        const contentContainer = document.createElement('div');
        contentContainer.className = 'item-content-container';
        // Initial rendering using the optimized function
        renderItemContent(contentContainer, item.content, item.id);

        // --- Buttons Container ---
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'item-buttons';

        // Create Buttons (structure only, listeners added via delegation) - REMOVED Edit/Save/Cancel
        buttonContainer.innerHTML = `
            <button class="copy-button">Copy</button>
            <button class="delete-button">Delete</button>
        `;

         // Add "Show More" / "Show Less" button
         const showMoreBtn = document.createElement('button');
         showMoreBtn.className = 'show-more-button';
         showMoreBtn.innerHTML = '显示更多 <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
         // Note: Listener for this will also be handled by delegation

        // Assemble the item
        itemDiv.appendChild(contentContainer);
        itemDiv.appendChild(buttonContainer);
        itemDiv.appendChild(showMoreBtn);

        fragment.appendChild(itemDiv); // Add to fragment
    });

    clipboardListElement.appendChild(fragment); // Append fragment to the DOM once

    // --- Post-render check for "Show More" button visibility ---
    // Needs to run AFTER items are in the DOM. setTimeout 0 trick.
    setTimeout(() => {
        const renderedItems = clipboardListElement.querySelectorAll('.clipboard-item');
        renderedItems.forEach(renderedItemDiv => {
            const contentContainer = renderedItemDiv.querySelector('.item-content-container');
            const showMoreBtn = renderedItemDiv.querySelector('.show-more-button');
            if (contentContainer && showMoreBtn) {
                const threshold = 110; // CSS max-height
                const isOverflowing = contentContainer.scrollHeight > threshold + 2;
                showMoreBtn.style.display = isOverflowing ? 'block' : 'none';
            }
        });
        // console.log("Post-render check for 'Show More' buttons completed."); // Keep if needed
    }, 0);

    statusElement.textContent = `Ready. ${items.length} item(s) loaded.`;
}

// --- Function: Fetch all clipboard items from Supabase ---
async function fetchClipboardItems() {
    if (!supabase) return;
    statusElement.textContent = 'Fetching clipboard history...';
    try {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select('*') // Select all columns (id, content, created_at)
            .order('created_at', { ascending: false }); // CHANGED: Order by creation time, newest first

        if (error) throw error;

        clipboardItems = data || []; // Update our local state
        renderClipboardList(clipboardItems); // Render the fetched items
        console.log('Clipboard items fetched and rendered (newest first).');

    } catch (error) {
        console.error('Error fetching clipboard items:', error);
        statusElement.textContent = `Error fetching history: ${error.message}`;
    }
}

// --- Function: Add a new item to Supabase ---
async function addNewItem() {
    // Get content from Quill editor as Delta object
    const delta = quillEditor.getContents();

    // Basic check if editor is empty (Delta has only one op: a newline insert)
    if (!delta || (delta.ops && delta.ops.length === 1 && delta.ops[0].insert === '\n') || !supabase) {
         console.log("Editor is empty or Supabase not ready. Not adding.");
        return; // Do nothing if no content or Supabase isn't ready
    }

    // The content to save is the Delta object itself
    const contentToSave = delta;
    console.log("Saving content (Delta):", JSON.stringify(contentToSave));


    addButton.disabled = true; // Disable button while saving
    addButton.textContent = 'Adding...';
    statusElement.textContent = 'Adding new item...';

    try {
        // Insert the Delta object into the jsonb column
        const { error } = await supabase
            .from(TABLE_NAME)
            .insert({ content: contentToSave }); // Save the Delta object

        if (error) {
            // Check for specific errors, e.g., RLS policy violation
             if (error.message.includes('violates row-level security policy')) {
                 console.error(`RLS Error adding item: Make sure INSERT policy is enabled.`);
                 statusElement.textContent = `Error: Cannot add item. Check permissions.`;
             } else {
                 throw error; // Re-throw other errors
             }
        } else {
             quillEditor.setContents([{ insert: '\n' }]); // Clear the editor on success
            console.log('New item added successfully.');
            statusElement.textContent = 'Item added!';
            showToast('添加成功', 'success');
            // Realtime should handle the UI update
        }

    } catch (error) {
        console.error('Error adding new item:', error);
        statusElement.textContent = `Error adding item: ${error.message}`;
    } finally {
        addButton.disabled = false; // Re-enable button
         addButton.textContent = 'Add Clip';
    }
}

// --- Function: Delete an item from Supabase ---
async function deleteItem(id) {
    if (!supabase) return;
    statusElement.textContent = `Deleting item ${id}...`;
    try {
        const { error } = await supabase
            .from(TABLE_NAME)
            .delete()
            .eq('id', id); // Specify which item to delete by ID

        if (error) throw error;

        console.log(`Item ${id} deleted successfully.`);
        statusElement.textContent = `Item ${id} deleted.`;
        showToast('删除成功', 'success');
        // No need to manually remove from list here, realtime 'DELETE' event will handle it

    } catch (error) {
        console.error(`Error deleting item ${id}:`, error);
        statusElement.textContent = `Error deleting item ${id}: ${error.message}`;
        // If deletion failed, we might need to re-enable the delete button on the item
        const failedButton = clipboardListElement.querySelector(`.clipboard-item[data-id='${id}'] .delete-button`);
        if(failedButton) {
            failedButton.disabled = false;
            failedButton.textContent = 'Delete';
        }
    }
}

// --- Function: Handle Realtime Updates ---
// OPTIMIZED: Modifies local state directly, newest first, no edit logic
function handleRealtimeUpdate(payload) {
    console.log('Realtime change received:', payload);
    statusElement.textContent = 'Realtime update received...';
    let needsRender = false;

    // --- Handling INSERT ---
    if (payload.eventType === 'INSERT') {
        const newItem = payload.new;
        // Add to the beginning of our local state for newest first
        clipboardItems.unshift(newItem); // CHANGED: Add to the start
        console.log(`Item ${newItem.id} inserted via realtime (added to top).`);
        statusElement.textContent = `New item added.`;
        needsRender = true;
    }
    // --- Handling DELETE ---
    else if (payload.eventType === 'DELETE') {
        const deletedItemId = payload.old.id;
        const initialLength = clipboardItems.length;
        clipboardItems = clipboardItems.filter(item => item.id !== deletedItemId);
        if (clipboardItems.length < initialLength) {
            console.log(`Item ${deletedItemId} removed via realtime.`);
            statusElement.textContent = `Item ${deletedItemId} removed.`;
             needsRender = true;
             // REMOVED: Check if the deleted item was being edited
             // if (activeItemEditors[deletedItemId]) { ... }
        }
    }
    // --- Handling UPDATE ---
    // NOTE: Since we removed editing, UPDATE might be less common unless done externally.
    // The logic still works to update the item in the list if needed.
    else if (payload.eventType === 'UPDATE') {
        const updatedItem = payload.new;
        const index = clipboardItems.findIndex(item => item.id === updatedItem.id);
        if (index !== -1) {
            // REMOVED: Check if the item being updated is currently in edit mode locally
            // if (activeItemEditors[updatedItem.id]) { ... }
            clipboardItems[index] = updatedItem;
            console.log(`Item ${updatedItem.id} updated via realtime.`);
            statusElement.textContent = `Item ${updatedItem.id} updated.`;
             needsRender = true;
        }
    }

    // Re-render the list if the local state changed
    if (needsRender) {
        renderClipboardList(clipboardItems);
    } else {
         statusElement.textContent = `Realtime event (${payload.eventType}) processed.`;
    }
}

// --- Function: Set up Realtime Subscription ---
function setupRealtimeSubscription() {
    if (!supabase) return;
    statusElement.textContent = 'Setting up realtime subscription...';
    const channel = supabase.channel('public-clipboard-history'); // A channel name for this feature

    channel
        .on(
            'postgres_changes',
            {
                event: '*', // Listen to INSERT, UPDATE, DELETE
                schema: 'public',
                table: TABLE_NAME
                // No filter needed, we want updates for the whole table
            },
            handleRealtimeUpdate // Call our handler function
        )
        .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log('Successfully subscribed to realtime updates for the table!');
                statusElement.textContent = 'Realtime connected. Fetching history...';
                // Once subscribed, fetch the initial list of items
                fetchClipboardItems();
            } else {
                console.error(`Realtime subscription failed or closed: ${status}`, err);
                statusElement.textContent = `Realtime error: ${status}`;
                // Add logic here to maybe retry subscription after a delay
            }
        });

    return channel; // Return channel if needed for unsubscribing later
}

// --- Main Execution Logic ---
if (supabase && editorContainer) {
    // 1. Initialize Quill Editor
    quillEditor = new Quill('#editor-container', {
        modules: {
            toolbar: [ // Basic toolbar options (image handler added later)
                [{ header: [1, 2, false] }],
                ['bold', 'italic', 'underline'],
                ['image', 'code-block'],
                [{ list: 'ordered'}, { list: 'bullet' }]
            ],
            clipboard: {
                // Enhance paste handling for images
                matchers: [
                    // Matcher for <img> tags
                    ['img', (node, delta) => {
                        const src = node.getAttribute('src');
                        console.log('Pasted image src:', src);

                        // Handle Base64 images
                        if (src && src.startsWith('data:image/')) {
                            console.log('Attempting to upload pasted Base64 image...');
                            // Convert Base64 to Blob/File
                            const blob = base64ToBlob(src);
                            if (blob) {
                                // Create a unique filename
                                const fileName = `pasted-${Date.now()}.${blob.type.split('/')[1] || 'png'}`;
                                const file = new File([blob], fileName, { type: blob.type });

                                // Reuse upload logic (needs slight refactoring or direct call)
                                // For simplicity here, we trigger upload directly.
                                // Ideally, refactor upload logic into a reusable function.
                                uploadPastedImage(file).then(imageUrl => {
                                    if (imageUrl) {
                                         // Return a Delta to insert the uploaded image URL
                                         // We replace the entire original Delta op for the image
                                         // This assumes the pasted image was a single op, which is usually true
                                        delta.ops = [{ insert: { image: imageUrl } }];
                                    } else {
                                        console.warn("Pasted Base64 image upload failed, keeping original (potentially broken) src.");
                                         // Keep original delta if upload fails
                                    }
                                }).catch(err => {
                                    console.error("Error processing pasted Base64 image:", err);
                                     // Keep original delta on error
                                });
                                // Important: Return the delta immediately. The promise above
                                // will modify its 'ops' property later if upload succeeds.
                                return delta;
                            } else {
                                 console.warn("Could not convert pasted Base64 src to Blob.");
                                 return delta; // Keep original if conversion fails
                            }
                        }
                        // Handle Blob URLs (less common for cross-app paste, but good to have)
                        else if (src && src.startsWith('blob:')) {
                             console.log('Attempting to upload pasted Blob image...');
                             // Fetch the blob data
                             fetch(src)
                                .then(res => res.blob())
                                .then(blob => {
                                    if (blob) {
                                        const fileName = `pasted-${Date.now()}.${blob.type.split('/')[1] || 'png'}`;
                                        const file = new File([blob], fileName, { type: blob.type });
                                        return uploadPastedImage(file);
                                    }
                                    return null;
                                })
                                .then(imageUrl => {
                                     if (imageUrl) {
                                        delta.ops = [{ insert: { image: imageUrl } }];
                                    } else {
                                        console.warn("Pasted Blob image upload failed, keeping original src.");
                                    }
                                })
                                .catch(err => {
                                     console.error("Error processing pasted Blob image:", err);
                                });
                               return delta; // Return delta immediately
                        }
                        // Otherwise, let Quill handle it (e.g., http/https URLs)
                        else {
                            console.log('Letting Quill handle non-data/blob image src:', src);
                            return delta;
                        }
                    }]
                ]
            }
        },
        placeholder: 'Paste or type content here...',
        theme: 'snow' // 'snow' is a standard theme with toolbar
    });
    console.log("Quill editor initialized with clipboard matcher.");


    // --- Custom Paste Handler ---
    quillEditor.root.addEventListener('paste', async (event) => {
        console.log('Paste event detected.');
        try {
            const items = await navigator.clipboard.read();
            let imageBlob = null;

            for (const item of items) {
                const imageType = item.types.find(type => type.startsWith('image/'));
                if (imageType) {
                    console.log('Direct image data found on clipboard.');
                    imageBlob = await item.getType(imageType);
                    break; // Found an image, prioritize it
                }
            }

            if (imageBlob) {
                console.log('Processing direct image paste.');
                event.preventDefault(); // IMPORTANT: Prevent Quill's default paste only if we handle it

                const file = new File([imageBlob], `pasted-${Date.now()}.${imageBlob.type.split('/')[1] || 'png'}`, { type: imageBlob.type });
                const originalRange = quillEditor.getSelection(true);
                const imageUrl = await uploadImageFile(file); // Use the reusable uploader

                if (imageUrl) {
                    quillEditor.insertEmbed(originalRange.index, 'image', imageUrl);
                    quillEditor.setSelection(originalRange.index + 1);
                    statusElement.textContent = 'Pasted image uploaded and inserted.';
                    console.log('Successfully handled direct image paste.');
                } else {
                     statusElement.textContent = 'Failed to upload pasted image.';
                     console.error('Pasted image upload failed.');
                     // Maybe allow default paste as fallback? Or show error?
                }
                return; // Stop processing this paste event further
            } else {
                 console.log('No direct image data found, allowing Quill default paste.');
                 // Let Quill's default paste (and our matchers) handle it
            }

        } catch (err) {
            console.error('Error reading clipboard:', err);
             // Let Quill's default paste handle it if clipboard reading fails
        }
    });


     // --- Helper: Base64 to Blob ---
    function base64ToBlob(base64) {
        try {
            const parts = base64.split(';base64,');
            const contentType = parts[0].split(':')[1];
            const raw = window.atob(parts[1]);
            const rawLength = raw.length;
            const uInt8Array = new Uint8Array(rawLength);
            for (let i = 0; i < rawLength; ++i) {
                uInt8Array[i] = raw.charCodeAt(i);
            }
            return new Blob([uInt8Array], { type: contentType });
        } catch (e) {
            console.error("Error converting Base64 to Blob:", e);
            return null;
        }
    }

     // --- Reusable Image Upload Logic ---
     // Takes a File object, returns Promise<string | null> (the image URL or null on failure)
    async function uploadImageFile(file) {
         if (!file || !supabase) {
            console.log("No file provided or Supabase not ready for upload.");
            return null;
        }
         statusElement.textContent = 'Uploading image...';
         try {
            const fileName = `${Date.now()}-${file.name}`;
            const filePath = `public/${fileName}`;
            const bucketName = 'clipboard-media';

            const { error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(filePath, file, { cacheControl: '3600', upsert: false });

            if (uploadError) throw uploadError;

            const { data: urlData, error: urlError } = supabase.storage
                .from(bucketName)
                .getPublicUrl(filePath);

            if (urlError) throw urlError;
            if (!urlData || !urlData.publicUrl) throw new Error("Failed to get public URL.");

            const imageUrl = urlData.publicUrl;
            console.log('Image uploaded successfully:', imageUrl);
            statusElement.textContent = 'Image uploaded.';
            return imageUrl;

        } catch (error) {
            console.error('Image upload failed:', error);
            statusElement.textContent = `Image upload failed: ${error.message}`;
            return null; // Indicate failure
        }
    }

     // --- Specific handler for pasted images ---
     // Returns Promise resolving to URL or null
     async function uploadPastedImage(file) {
        // We can add specific logic here if needed, but for now, just reuse the main uploader
        return await uploadImageFile(file);
     }


    // --- Quill Image Handler (for toolbar button) ---
    async function imageHandler() {
        const input = document.createElement('input');
         input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
             const file = input.files[0];
             const originalRange = quillEditor.getSelection(true); // Save cursor position

             const imageUrl = await uploadImageFile(file); // Use the reusable uploader

             if (imageUrl) {
                 // Insert image into Quill editor at the original cursor position
                 quillEditor.insertEmbed(originalRange.index, 'image', imageUrl);
                 quillEditor.setSelection(originalRange.index + 1); // Move cursor after image
                 statusElement.textContent = 'Image uploaded and inserted.';
             }
             // Reset file input
             input.value = '';
         };
    }

     // Bind the image handler to the Quill toolbar
    quillEditor.getModule('toolbar').addHandler('image', imageHandler);


    // 2. Add event listener for the "Add Clip" button
    addButton.addEventListener('click', addNewItem);

    // Optional: Keyboard shortcut (e.g., Ctrl+Enter) - might conflict with Quill's defaults
    // editorContainer.addEventListener('keydown', (event) => { ... });


    // 3. Set up the realtime subscription
    setupRealtimeSubscription();

    // --- Event Listener using Delegation for Item Actions ---
    clipboardListElement.addEventListener('click', async (event) => {
        const target = event.target;
        const itemDiv = target.closest('.clipboard-item');
        if (!itemDiv) return; // Click wasn't inside a relevant item part

        const itemId = itemDiv.dataset.id;
        const itemData = clipboardItems.find(i => i.id == itemId); // Find item data
        if (!itemData) {
             console.error(`Could not find data for item ID: ${itemId}`);
             return;
         }

        // REMOVED: References to contentContainer, buttonContainer, showMoreButton as they are less needed here
        // const contentContainer = itemDiv.querySelector('.item-content-container');
        // const buttonContainer = itemDiv.querySelector('.item-buttons');
        // const showMoreButton = itemDiv.querySelector('.show-more-button');


        // --- Handle Button Clicks ---

        // REMOVED: Edit Button handler
        // if (target.classList.contains('edit-button')) { ... }

        // REMOVED: Save Button handler
        // else if (target.classList.contains('save-button')) { ... }

        // REMOVED: Cancel Button handler
        // else if (target.classList.contains('cancel-button')) { ... }

        // Delete Button
        if (target.classList.contains('delete-button')) { // Adjusted: Was 'else if'
            target.disabled = true;
            target.textContent = 'Deleting...';
            await deleteItem(itemId);
            // No need to manually re-enable, realtime DELETE handler will remove the item.
        }

        // Copy Button
        else if (target.classList.contains('copy-button')) {
            let textToCopy = '';
            const copyButton = target; // Reference the button
            try {
                let contentData = itemData.content;
                if (typeof contentData === 'string') {
                    textToCopy = contentData;
                } else if (contentData && typeof contentData === 'object' && Array.isArray(contentData.ops)) {
                     // Create temp Quill to get text from Delta
                     const tempDiv = document.createElement('div');
                     const tempQuill = new Quill(tempDiv);
                     tempQuill.setContents(contentData);
                     textToCopy = tempQuill.getText().replace(/\n$/, ''); // Get text, trim trailing newline
                } else {
                    textToCopy = '[Unsupported Content Format]';
                }

                await navigator.clipboard.writeText(textToCopy);
                showToast('已复制到剪贴板', 'success');
                copyButton.textContent = 'Copied!';
                copyButton.disabled = true;
                setTimeout(() => {
                    copyButton.textContent = 'Copy';
                    copyButton.disabled = false;
                }, 1500);
            } catch (err) {
                console.error('Failed to copy text: ', err);
                showToast('复制失败', 'error');
                copyButton.textContent = 'Error';
                setTimeout(() => {
                    copyButton.textContent = 'Copy';
                }, 1500);
            }
        }

        // Show More Button
        else if (target.classList.contains('show-more-button') || target.closest('.show-more-button')) {
            const btn = target.closest('.show-more-button'); // Get the button element itself
            itemDiv.classList.toggle('expanded');
            if (itemDiv.classList.contains('expanded')) {
                btn.innerHTML = '收起 <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M6 12l4-4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            } else {
                btn.innerHTML = '显示更多 <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            }
        }
    });

} else if (!editorContainer) {
     console.error("Quill container '#editor-container' not found.");
     statusElement.textContent = 'Error: Editor UI element missing!';
} else {
    statusElement.textContent = 'Failed to connect to backend. Check console.';
}
