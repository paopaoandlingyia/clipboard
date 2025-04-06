import { createClient } from '@supabase/supabase-js';
import Quill from 'quill'; // Import Quill

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

// --- Function: Render the list of clipboard items ---
function renderClipboardList(items) {
    if (!clipboardListElement) return;
    clipboardListElement.innerHTML = ''; // Clear the current list display

    if (items.length === 0) {
        clipboardListElement.innerHTML = '<p>No clipboard items yet.</p>';
        return;
    }

    items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'clipboard-item';
        itemDiv.dataset.id = item.id;

        // --- Content Display ---
        const contentContainer = document.createElement('div');
        contentContainer.className = 'item-content-container';

        // --- Render content based on whether it's Quill Delta or plain text (legacy/converted) ---
        try {
            let contentToShow = item.content; // This is now expected to be jsonb

            // Check if content is a simple JSON string (likely converted plain text)
            if (typeof contentToShow === 'string') {
                // Render as plain text in a <pre> tag for compatibility
                 const pre = document.createElement('pre');
                 pre.textContent = contentToShow; // Display the raw string
                 contentContainer.appendChild(pre);
                 console.warn(`Item ${item.id}: Content is a plain string, rendering as text.`);

            } else if (contentToShow && typeof contentToShow === 'object' && Array.isArray(contentToShow.ops)) {
                 // It looks like a Quill Delta object, render it using a temporary Quill instance
                const tempEditorDiv = document.createElement('div');
                contentContainer.appendChild(tempEditorDiv); // Add div to container first
                const quillViewer = new Quill(tempEditorDiv, {
                    theme: 'snow', // Use a theme for proper styling
                    readOnly: true, // Make it non-editable
                    modules: { toolbar: false } // No toolbar needed for viewing
                });
                quillViewer.setContents(contentToShow); // Load the Delta object
                console.log(`Item ${item.id}: Rendered Delta content.`);
            } else {
                 // Handle unexpected content format
                 console.error(`Item ${item.id}: Unknown content format`, contentToShow);
                 const pre = document.createElement('pre');
                 pre.textContent = '[Error: Unknown content format]';
                 contentContainer.appendChild(pre);
            }

        } catch (e) {
             console.error(`Error rendering content for item ${item.id}:`, e, item.content);
             const pre = document.createElement('pre');
             pre.textContent = `[Error rendering content: ${e.message}]`;
             contentContainer.appendChild(pre);
        }


        // --- Buttons ---
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'item-buttons';

        // Create Edit Button
        const editButton = document.createElement('button');
        editButton.textContent = 'Edit';
        editButton.className = 'edit-button';

        // Create Save Button (initially hidden)
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save';
        saveButton.className = 'save-button';
        saveButton.style.display = 'none'; // Hide initially

        // Create Cancel Button (initially hidden)
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'cancel-button';
        cancelButton.style.display = 'none'; // Hide initially


        // Create Copy Button
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy';
        copyButton.className = 'copy-button';
        copyButton.addEventListener('click', async () => {
            let textToCopy = '';
            try {
                // Determine the text content to copy
                let contentData = item.content;
                if (typeof contentData === 'string') {
                    textToCopy = contentData; // Legacy plain text
                } else if (contentData && typeof contentData === 'object' && Array.isArray(contentData.ops)) {
                    // Create a temporary Quill instance to get plain text from Delta
                    const tempDiv = document.createElement('div');
                    const tempQuill = new Quill(tempDiv); // No theme/toolbar needed
                    tempQuill.setContents(contentData);
                    textToCopy = tempQuill.getText(); // Get plain text
                } else {
                    textToCopy = '[Unsupported Content Format]'; // Fallback
                }

                // Trim potential excessive newlines often added by getText()
                textToCopy = textToCopy.trim();

                await navigator.clipboard.writeText(textToCopy);
                copyButton.textContent = 'Copied!';
                copyButton.disabled = true;
                setTimeout(() => {
                    copyButton.textContent = 'Copy';
                    copyButton.disabled = false;
                }, 1500); // Reset after 1.5 seconds
            } catch (err) {
                console.error('Failed to copy text: ', err);
                // Optionally show an error message to the user
                copyButton.textContent = 'Error';
                 setTimeout(() => {
                    copyButton.textContent = 'Copy';
                }, 1500);
            }
        });

        // Create Delete Button
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'delete-button';
        deleteButton.addEventListener('click', async (e) => {
            // Prevent double clicks, show loading state
            e.target.disabled = true;
            e.target.textContent = 'Deleting...';
            await deleteItem(item.id);
            // Re-enable button in case of error (realtime will handle removal on success)
            // e.target.disabled = false;
            // e.target.textContent = 'Delete';
        });

        // --- Edit Mode Toggle Logic ---
        let itemEditorInstance = null; // To hold the Quill instance for editing this specific item

        editButton.addEventListener('click', () => {
            // Initialize Quill editor for this item
            contentContainer.innerHTML = ''; // Clear current content (viewer/pre)
            const editDiv = document.createElement('div');
            editDiv.style.height = '100px'; // Give it some initial height
            contentContainer.appendChild(editDiv);

            itemEditorInstance = new Quill(editDiv, {
                 theme: 'snow',
                 modules: { toolbar: true } // Show toolbar for editing
            });

            // Load content - handle both Delta and legacy string format
            let contentToLoad = item.content;
             if (typeof contentToLoad === 'string') {
                 // Convert legacy string to Delta format for editing
                 itemEditorInstance.setText(contentToLoad);
                 console.log(`Item ${item.id}: Loaded legacy string into editor.`);
             } else if (contentToLoad && typeof contentToLoad === 'object' && Array.isArray(contentToLoad.ops)) {
                 itemEditorInstance.setContents(contentToLoad); // Load Delta
                 console.log(`Item ${item.id}: Loaded Delta into editor.`);
             } else {
                 console.error(`Item ${item.id}: Cannot load unknown format into editor.`, contentToLoad);
                 itemEditorInstance.setText('[Error loading content]');
             }


            // Toggle button visibility
            editButton.style.display = 'none';
            copyButton.style.display = 'none';
            deleteButton.style.display = 'none';
            saveButton.style.display = 'inline-block'; // Show save
            cancelButton.style.display = 'inline-block'; // Show cancel
        });

        function exitEditMode() {
             // Destroy the item's Quill editor instance
             if (itemEditorInstance) {
                 // It seems Quill doesn't have a built-in destroy. We just remove the element.
                 // Best practice might involve more cleanup if listeners were added directly to Quill.
                 itemEditorInstance = null;
             }
             // Re-render the item in read-only mode
             // Easiest way is often to just re-render the whole list or fetch again,
             // but let's try re-rendering just this item's content viewer for now.
             renderItemContent(contentContainer, item.content, item.id); // Need a helper function

            // Toggle button visibility back
            editButton.style.display = 'inline-block';
            copyButton.style.display = 'inline-block';
            deleteButton.style.display = 'inline-block';
            saveButton.style.display = 'none';
            cancelButton.style.display = 'none';
        }

        // --- Save Logic ---
        saveButton.addEventListener('click', async () => {
            if (!itemEditorInstance) return;

            const newDeltaContent = itemEditorInstance.getContents(); // Get Delta from item editor
            console.log(`Saving updated Delta for item ${item.id}:`, JSON.stringify(newDeltaContent));

            // Add saving visual state
            saveButton.textContent = 'Saving...';
            saveButton.disabled = true;
            cancelButton.disabled = true;

            await updateItem(item.id, newDeltaContent); // Pass the Delta object to updateItem

            // Exit edit mode (Realtime should handle the update display, but we exit edit mode locally)
            // Update function might return success/failure for better handling here
            // For now, assume success or rely on realtime refresh
             exitEditMode();
             // Reset button state just in case
             saveButton.textContent = 'Save';
             saveButton.disabled = false;
             cancelButton.disabled = false;

        });

        // --- Cancel Logic ---
        cancelButton.addEventListener('click', () => {
            exitEditMode(); // Just revert UI changes
        });


        // Add buttons to their container (in desired order)
        buttonContainer.appendChild(editButton);
        buttonContainer.appendChild(copyButton);
        buttonContainer.appendChild(deleteButton);
        buttonContainer.appendChild(saveButton); // Add hidden buttons
        buttonContainer.appendChild(cancelButton);

        // Add content and buttons to the item container
        itemDiv.appendChild(contentContainer); // Add the content container
        itemDiv.appendChild(buttonContainer);
        clipboardListElement.appendChild(itemDiv);
    });
     statusElement.textContent = `Ready. ${items.length} item(s) loaded.`;
}

// Helper function to render item content (used initially and after exiting edit mode)
function renderItemContent(container, contentData, itemId) {
    container.innerHTML = ''; // Clear previous content
     try {
            // Check if content is a simple JSON string (likely converted plain text)
            if (typeof contentData === 'string') {
                 const pre = document.createElement('pre');
                 pre.textContent = contentData;
                 container.appendChild(pre);
            } else if (contentData && typeof contentData === 'object' && Array.isArray(contentData.ops)) {
                 // Render Delta using a temporary Quill instance
                const tempEditorDiv = document.createElement('div');
                container.appendChild(tempEditorDiv);
                const quillViewer = new Quill(tempEditorDiv, {
                    theme: 'snow', readOnly: true, modules: { toolbar: false }
                });
                quillViewer.setContents(contentData);
            } else {
                 console.error(`Item ${itemId}: Unknown content format during re-render`, contentData);
                 const pre = document.createElement('pre');
                 pre.textContent = '[Error: Unknown content format]';
                 container.appendChild(pre);
            }
        } catch (e) {
             console.error(`Error re-rendering content for item ${itemId}:`, e, contentData);
             const pre = document.createElement('pre');
             pre.textContent = `[Error rendering content: ${e.message}]`;
             container.appendChild(pre);
        }
}


// --- Function: Update an item in Supabase ---
// newContent is now expected to be a Quill Delta object
async function updateItem(id, newContentDelta) {
    if (!supabase) return;
    statusElement.textContent = `Updating item ${id}...`;
    console.log(`Attempting to update item ${id} with Delta:`, JSON.stringify(newContentDelta));

    try {
        // Save the Delta object directly
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .update({ content: newContentDelta }) // Save the Delta object
            .eq('id', id)
            .select();

        if (error) {
             // Check for specific errors, e.g., RLS policy violation
             if (error.message.includes('violates row-level security policy')) {
                 console.error(`RLS Error updating item ${id}: Make sure UPDATE policy is enabled.`);
                 statusElement.textContent = `Error: Cannot update item ${id}. Check permissions.`;
             } else {
                 throw error; // Re-throw other errors
             }
        } else {
            console.log(`Item ${id} updated successfully. Response data:`, data);
            statusElement.textContent = `Item ${id} updated.`;
            // Realtime should handle the UI update, or fetchClipboardItems() in handleRealtimeUpdate
        }

    } catch (error) {
        console.error(`Error updating item ${id}:`, error);
        statusElement.textContent = `Error updating item ${id}: ${error.message}`;
        // We might need to signal the UI to re-enable buttons or show an error state
    }
}


// --- Function: Fetch all clipboard items from Supabase ---
async function fetchClipboardItems() {
    if (!supabase) return;
    statusElement.textContent = 'Fetching clipboard history...';
    try {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select('*') // Select all columns (id, content, created_at)
            .order('created_at', { ascending: true }); // Order by creation time, oldest first

        if (error) throw error;

        clipboardItems = data || []; // Update our local state
        renderClipboardList(clipboardItems); // Render the fetched items
        console.log('Clipboard items fetched and rendered.');

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
function handleRealtimeUpdate(payload) {
    console.log('Realtime change received:', payload);
    statusElement.textContent = 'Realtime update received...';

    // --- Handling INSERT ---
    if (payload.eventType === 'INSERT') {
        const newItem = payload.new;
        // Add to our local state (maintaining sort order - easiest is often to just refetch)
        // Simple approach: Refetch the whole list to ensure correct order
        console.log('INSERT detected, refetching list...');
        fetchClipboardItems();
        // More advanced: Insert newItem into the clipboardItems array in the correct sorted position
        // and then call renderClipboardList(clipboardItems);
    }
    // --- Handling DELETE ---
    else if (payload.eventType === 'DELETE') {
        const deletedItemId = payload.old.id;
        // Remove from our local state
        clipboardItems = clipboardItems.filter(item => item.id !== deletedItemId);
        // Re-render the list from the updated state
        renderClipboardList(clipboardItems);
        console.log(`Item ${deletedItemId} removed via realtime.`);
        statusElement.textContent = `Item ${deletedItemId} removed.`;
    }
    // --- Handling UPDATE (optional for now, but good practice) ---
    else if (payload.eventType === 'UPDATE') {
        // If we later allow editing, we'd handle it here
        // Simple approach: Refetch
        console.log('UPDATE detected, refetching list...');
        fetchClipboardItems();
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
if (supabase && editorContainer) { // Check if editor container exists
    // 1. Initialize Quill Editor
    quillEditor = new Quill('#editor-container', {
        modules: {
            toolbar: [ // Basic toolbar options
                [{ header: [1, 2, false] }],
                ['bold', 'italic', 'underline'],
                ['image', 'code-block'], // Add image button
                [{ list: 'ordered'}, { list: 'bullet' }]
            ]
        },
        placeholder: 'Paste or type content here...',
        theme: 'snow' // 'snow' is a standard theme with toolbar
    });
    console.log("Quill editor initialized.");

    // --- Quill Image Handler ---
    async function imageHandler() {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            const file = input.files[0];
            if (!file || !supabase) {
                console.log("No file selected or Supabase not ready.");
                return;
            }

            // Show uploading status
            statusElement.textContent = 'Uploading image...';
            const originalRange = quillEditor.getSelection(true); // Save cursor position

            try {
                // Create a unique file path (e.g., using timestamp and original filename)
                const fileName = `${Date.now()}-${file.name}`;
                const filePath = `public/${fileName}`; // Store in a 'public' folder within the bucket

                // Upload file to Supabase Storage
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('clipboard-media') // Your bucket name
                    .upload(filePath, file, {
                        cacheControl: '3600', // Optional: Cache control
                        upsert: false // Optional: Don't overwrite existing files with same name
                    });

                if (uploadError) {
                    throw uploadError;
                }

                // Get the public URL of the uploaded file
                const { data: urlData, error: urlError } = supabase.storage
                    .from('clipboard-media')
                    .getPublicUrl(filePath); // Use the exact path used for upload

                 if (urlError) {
                    throw urlError;
                }

                if (!urlData || !urlData.publicUrl) {
                     throw new Error("Failed to get public URL after upload.");
                 }

                const imageUrl = urlData.publicUrl;
                console.log('Image uploaded successfully:', imageUrl);

                // Insert image into Quill editor at the original cursor position
                quillEditor.insertEmbed(originalRange.index, 'image', imageUrl);
                quillEditor.setSelection(originalRange.index + 1); // Move cursor after image

                statusElement.textContent = 'Image uploaded and inserted.';

            } catch (error) {
                console.error('Image upload failed:', error);
                statusElement.textContent = `Image upload failed: ${error.message}`;
            } finally {
                 // Reset file input (important for selecting the same file again)
                input.value = '';
            }
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

} else if (!editorContainer) {
     console.error("Quill container '#editor-container' not found.");
     statusElement.textContent = 'Error: Editor UI element missing!';

} else {
    // Handle case where Supabase client failed to initialize
    statusElement.textContent = 'Failed to connect to backend. Check console.';
}
