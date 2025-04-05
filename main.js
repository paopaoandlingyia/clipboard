import { createClient } from '@supabase/supabase-js';

// --- 配置 ---
// 读取环境变量 (Vite 会处理这个)
// 确保在 Vercel 中设置了 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 你的 Supabase 表名和用于存储内容的行的 ID
const TABLE_NAME = 'clipboard'; // 你的表名
const ROW_ID = 1;              // 假设你用 id=1 的行来存储剪贴板内容

// --- 获取 HTML 元素 ---
const statusElement = document.getElementById('status');
const textarea = document.getElementById('clipboardContent');

// --- 初始化 Supabase 客户端 ---
let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseAnonKey);
        console.log('Supabase client initialized.');
        statusElement.textContent = 'Supabase client initialized.';
    } catch (error) {
        console.error("Error initializing Supabase:", error);
        statusElement.textContent = `Error initializing Supabase: ${error.message}`;
    }
} else {
    console.error('Supabase URL or Anon Key is missing. Check environment variables.');
    statusElement.textContent = 'Error: Supabase URL or Anon Key missing!';
}

// --- 防抖函数 (避免过于频繁地保存) ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- 函数：从 Supabase 获取初始内容 ---
async function fetchInitialContent() {
    if (!supabase) return;
    statusElement.textContent = 'Fetching initial content...';
    try {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select('content')
            .eq('id', ROW_ID)
            .single(); // 只获取一行

        if (error) {
            // 如果错误是因为行不存在 (e.g., code 'PGRST116')，这不是严重错误，只是还没内容
            if (error.code === 'PGRST116') {
                console.log('No initial content found (row might not exist yet).');
                textarea.value = ''; // 清空文本区
                statusElement.textContent = 'Ready. No content yet.';
                // 可选：如果行不存在，可以尝试插入一个空行
                // await supabase.from(TABLE_NAME).insert({ id: ROW_ID, content: '' });
            } else {
                throw error; // 其他错误需要报告
            }
        } else if (data) {
            textarea.value = data.content || ''; // 设置文本区内容
            statusElement.textContent = 'Ready and synced.';
        } else {
             textarea.value = ''; // 以防万一 data 为 null
             statusElement.textContent = 'Ready. No content found.';
        }
         console.log('Initial content loaded.');
    } catch (error) {
        console.error('Error fetching initial content:', error);
        statusElement.textContent = `Error fetching content: ${error.message}`;
    }
}

// --- 函数：保存内容到 Supabase ---
async function saveContent(content) {
    if (!supabase) return;
    statusElement.textContent = 'Saving...';
    try {
        // 使用 upsert: 如果行存在则更新，不存在则插入 (需要 id 是主键)
        const { error } = await supabase
            .from(TABLE_NAME)
            .upsert({ id: ROW_ID, content: content }, { onConflict: 'id' });

        if (error) throw error;

        console.log('Content saved successfully.');
        // 状态会在实时更新时变为 Ready and synced
        // statusElement.textContent = 'Saved.'; // 可以暂时显示 Saved
    } catch (error) {
        console.error('Error saving content:', error);
        statusElement.textContent = `Error saving: ${error.message}`;
    }
}

// 使用防抖包装保存函数，延迟 1 秒执行
const debouncedSaveContent = debounce(saveContent, 1000); // 1000ms = 1 second

// --- 函数：处理实时更新 ---
function handleRealtimeUpdate(payload) {
    console.log('Realtime change received:', payload);
    statusElement.textContent = 'Change received, updating...';
    if (payload.new && payload.new.id === ROW_ID) {
        const newContent = payload.new.content || '';
        // 只在内容确实不同，并且当前文本框不是焦点时更新，避免光标跳动
        if (textarea.value !== newContent && document.activeElement !== textarea) {
            textarea.value = newContent;
            console.log('Textarea updated from realtime event.');
        } else if (textarea.value !== newContent && document.activeElement === textarea) {
            console.log('Realtime update received while editing, content differs. Consider manual sync or ignoring.');
            // 如果内容不同步了，可能还是需要更新，但要小心光标
            // 简单的处理：还是更新吧，让用户知道远程变了
            const cursorPosition = textarea.selectionStart;
            textarea.value = newContent;
            try {
               textarea.setSelectionRange(cursorPosition, cursorPosition);
            } catch (e) { /* 忽略可能的错误 */ }
        } else {
             console.log('Realtime update ignored (content same or editing).');
        }
         statusElement.textContent = 'Ready and synced.';
    }
}

// --- 设置实时订阅 ---
function setupRealtimeSubscription() {
    if (!supabase) return;
    statusElement.textContent = 'Setting up realtime subscription...';
    const channel = supabase.channel(`clipboard-room-${ROW_ID}`); // 为特定行创建频道

    channel
        .on(
            'postgres_changes',
            {
                event: '*', // 监听所有事件 (INSERT, UPDATE, DELETE)
                schema: 'public',
                table: TABLE_NAME,
                filter: `id=eq.${ROW_ID}` // 只监听特定行的变化
            },
            handleRealtimeUpdate
        )
        .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log(`Successfully subscribed to realtime updates for row ${ROW_ID}!`);
                statusElement.textContent = 'Realtime connected. Fetching content...';
                // 订阅成功后，获取一次最新内容
                fetchInitialContent();
            } else {
                console.error(`Realtime subscription failed or closed: ${status}`, err);
                statusElement.textContent = `Realtime error: ${status}`;
                // 可以尝试重新连接等错误处理
            }
        });

    // 返回 channel 对象，以便之后可以取消订阅（如果需要）
    return channel;
}

// --- 主程序逻辑 ---
if (supabase) {
    // 1. 监听文本框输入事件，触发防抖保存
    textarea.addEventListener('input', () => {
        debouncedSaveContent(textarea.value);
    });

    // 2. 设置实时订阅
    setupRealtimeSubscription();

} else {
     // Supabase 未初始化时的处理
     textarea.disabled = true; // 禁用文本框
}
