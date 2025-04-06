import { createClient } from '@supabase/supabase-js';

// --- Configuration ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TABLE_NAME = 'clipboard'; // Your table name

// --- Get HTML Elements ---
const statusElement = document.getElementById('status');
const newItemTextarea = document.getElementById('newItemContent');
const addButton = document.getElementById('addButton');
const clipboardListElement = document.getElementById('clipboardList');

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
    if (newItemTextarea) newItemTextarea.disabled = true;
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
        itemDiv.dataset.id = item.id; // Store the item ID on the element

        // --- Content Display ---
        const contentContainer = document.createElement('div');
        contentContainer.className = 'item-content-container'; // Container for pre or textarea

        const contentPre = document.createElement('pre');
        contentPre.className = 'item-content';
        contentPre.textContent = item.content || '';
        contentContainer.appendChild(contentPre); // Add pre initially

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
            try {
                await navigator.clipboard.writeText(item.content || '');
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
        editButton.addEventListener('click', () => {
            // Show textarea, hide pre
            contentContainer.innerHTML = ''; // Clear content container
            const editTextArea = document.createElement('textarea');
            editTextArea.className = 'edit-textarea';
            editTextArea.value = item.content || '';
            contentContainer.appendChild(editTextArea);

            // Toggle button visibility
            editButton.style.display = 'none';
            copyButton.style.display = 'none';
            deleteButton.style.display = 'none';
            saveButton.style.display = 'inline-block'; // Show save
            cancelButton.style.display = 'inline-block'; // Show cancel
        });

        function exitEditMode() {
             // Restore pre, hide textarea
            contentContainer.innerHTML = '';
            contentContainer.appendChild(contentPre); // Re-add original pre

            // Toggle button visibility back
            editButton.style.display = 'inline-block';
            copyButton.style.display = 'inline-block';
            deleteButton.style.display = 'inline-block';
            saveButton.style.display = 'none';
            cancelButton.style.display = 'none';
        }

        // --- Save Logic ---
        saveButton.addEventListener('click', async () => {
            const newContent = contentContainer.querySelector('.edit-textarea').value.trim();
            // Add saving visual state
            saveButton.textContent = 'Saving...';
            saveButton.disabled = true;
            cancelButton.disabled = true;

            await updateItem(item.id, newContent); // Call update function (to be defined)

            // Exit edit mode (Realtime should handle the update display, but we exit edit mode locally)
            // We might need more robust state handling if the update fails
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


// --- Function: Update an item in Supabase ---
async function updateItem(id, newContent) {
    if (!supabase) return;
    statusElement.textContent = `Updating item ${id}...`;
    console.log(`Attempting to update item ${id} with content: "${newContent}"`); // Log content being sent

    try {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .update({ content: newContent }) // Update the content column
            .eq('id', id)                     // Where the id matches
            .select();                        // Optionally select the updated row

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
    const content = newItemTextarea.value.trim(); // Get text and remove leading/trailing whitespace
    if (!content || !supabase) {
        return; // Do nothing if no content or Supabase isn't ready
    }

    addButton.disabled = true; // Disable button while saving
    addButton.textContent = 'Adding...';
    statusElement.textContent = 'Adding new item...';

    try {
        const { error } = await supabase
            .from(TABLE_NAME)
            .insert({ content: content }); // Only need to insert content, id/created_at are automatic

        if (error) throw error;

        newItemTextarea.value = ''; // Clear the input box on success
        console.log('New item added successfully.');
        statusElement.textContent = 'Item added!';
        // No need to manually add to list here, realtime 'INSERT' event will handle it

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
if (supabase) {
    // 1. Add event listener for the "Add Clip" button
    addButton.addEventListener('click', addNewItem);

    // Optional: Allow pressing Enter in textarea to add clip (Shift+Enter for newline)
    newItemTextarea.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // Prevent default Enter behavior (newline)
            addNewItem();
        }
    });


    // 2. Set up the realtime subscription
    setupRealtimeSubscription();

} else {
    // Handle case where Supabase client failed to initialize
    statusElement.textContent = 'Failed to connect to backend. Check console.';
}
