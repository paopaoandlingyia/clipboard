import { createClient } from '@supabase/supabase-js';
import Quill from 'quill'; // 引入 Quill

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

// --- 配置区 ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TABLE_NAME = 'clipboard'; // 表名

// --- 获取页面元素 ---
const statusElement = document.getElementById('status');
const editorContainer = document.getElementById('editor-container'); // Quill编辑器容器
const addButton = document.getElementById('addButton');
const clipboardListElement = document.getElementById('clipboardList');

// --- 初始化 Quill 编辑器变量 ---
let quillEditor = null; // 主编辑器实例

// --- 初始化 Supabase 客户端 ---
let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseAnonKey);
        console.log('Supabase client initialized.');
        statusElement.textContent = 'Supabase 客户端已初始化。';
    } catch (error) {
        console.error("初始化 Supabase 出错:", error);
        statusElement.textContent = `初始化 Supabase 出错: ${error.message}`;
        if (addButton) addButton.disabled = true;
    }
} else {
    console.error('Supabase URL 或 Anon Key 缺失，请检查环境变量。');
    statusElement.textContent = '错误: 缺少 Supabase URL 或 Anon Key!';
    if (addButton) addButton.disabled = true;
}

// --- 状态变量 ---
let clipboardItems = []; // 当前剪贴板项目列表

// 渲染单条内容（只读视图，避免为每条都创建 Quill 实例）
// 优化 renderItemContent 函数
function renderItemContent(container, contentData, itemId) {
    container.innerHTML = '';
    try {
        if (typeof contentData === 'string') {
            // 纯文本内容 - 简化处理
            container.textContent = contentData;
            return;
        }
        
        if (contentData && typeof contentData === 'object' && Array.isArray(contentData.ops)) {
            // 创建文档片段提高性能
            const fragment = document.createDocumentFragment();
            
            contentData.ops.forEach(op => {
                if (op.insert && typeof op.insert === 'object' && op.insert.image) {
                    // 图片元素
                    const img = document.createElement('img');
                    img.src = op.insert.image;
                    img.alt = "粘贴的图片";
                    img.loading = "lazy"; // 添加懒加载
                    fragment.appendChild(img);
                } else if (typeof op.insert === 'string') {
                    // 文本内容 - 保留换行
                    const text = op.insert.replace(/\n/g, '<br>');
                    const span = document.createElement('span');
                    span.innerHTML = text;
                    fragment.appendChild(span);
                }
            });
            
            container.appendChild(fragment);
            return;
        }
        
        // 处理未知格式
        container.textContent = '[内容格式未知]';
    } catch (e) {
        console.error(`渲染项目 ${itemId} 内容出错:`, e);
        container.textContent = `[渲染出错: ${e.message}]`;
    }
}

// --- 渲染剪贴板项目列表 ---
function renderClipboardList(items) {
    if (!clipboardListElement) return;
    clipboardListElement.innerHTML = '';
    if (items.length === 0) {
        clipboardListElement.innerHTML = '<p>暂无剪贴板内容。</p>';
        return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'clipboard-item';
        itemDiv.dataset.id = item.id;
        // 内容区
        const contentContainer = document.createElement('div');
        contentContainer.className = 'item-content-container';
        renderItemContent(contentContainer, item.content, item.id);
        // 按钮区
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'item-buttons';
        buttonContainer.innerHTML = `
            <button class="copy-button">复制</button>
            <button class="delete-button">删除</button>
        `;
        // 显示更多/收起按钮
        const showMoreBtn = document.createElement('button');
        showMoreBtn.className = 'show-more-button';
        showMoreBtn.innerHTML = '显示更多 <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        itemDiv.appendChild(contentContainer);
        itemDiv.appendChild(buttonContainer);
        itemDiv.appendChild(showMoreBtn);
        fragment.appendChild(itemDiv);
    });
    clipboardListElement.appendChild(fragment);
    // 检查是否需要显示"显示更多"按钮
    setTimeout(() => {
        const renderedItems = clipboardListElement.querySelectorAll('.clipboard-item');
        renderedItems.forEach(renderedItemDiv => {
            const contentContainer = renderedItemDiv.querySelector('.item-content-container');
            const showMoreBtn = renderedItemDiv.querySelector('.show-more-button');
            const threshold = 110;
            const isOverflowing = contentContainer.scrollHeight > threshold + 2;
            showMoreBtn.style.display = isOverflowing ? 'block' : 'none';
        });
    }, 0);
    statusElement.textContent = `就绪，已加载 ${items.length} 条内容。`;
}

// --- 从 Supabase 获取所有剪贴板内容 ---
async function fetchClipboardItems() {
    if (!supabase) return;
    statusElement.textContent = '正在获取剪贴板历史...';
    try {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        clipboardItems = data || [];
        renderClipboardList(clipboardItems);
        console.log('剪贴板内容已获取并渲染（新到旧）。');
    } catch (error) {
        console.error('获取剪贴板内容出错:', error);
        statusElement.textContent = `获取历史出错: ${error.message}`;
    }
}

// --- 新增一条剪贴板内容 ---
async function addNewItem() {
    const delta = quillEditor.getContents();
    // 检查编辑器是否为空
    if (!delta || (delta.ops && delta.ops.length === 1 && delta.ops[0].insert === '\n') || !supabase) {
        console.log("编辑器为空或 Supabase 未就绪，不添加。");
        return;
    }
    const contentToSave = delta;
    console.log("保存内容(Delta):", JSON.stringify(contentToSave));
    addButton.disabled = true;
    addButton.textContent = '添加中...';
    statusElement.textContent = '正在添加新内容...';
    try {
        const { error } = await supabase
            .from(TABLE_NAME)
            .insert({ content: contentToSave });
        if (error) {
            if (error.message.includes('violates row-level security policy')) {
                console.error(`RLS 错误: 请确保 INSERT 策略已开启。`);
                statusElement.textContent = `错误: 无法添加内容，请检查权限。`;
            } else {
                throw error;
            }
        } else {
            quillEditor.setContents([{ insert: '\n' }]);
            console.log('新内容添加成功。');
            statusElement.textContent = '内容已添加!';
            showToast('添加成功', 'success');
        }
    } catch (error) {
        console.error('添加新内容出错:', error);
        statusElement.textContent = `添加内容出错: ${error.message}`;
    } finally {
        addButton.disabled = false;
        addButton.textContent = '添加';
    }
}

// --- 删除一条内容 ---
async function deleteItem(id) {
    if (!supabase) return;
    statusElement.textContent = `正在删除内容 ${id}...`;
    try {
        const { error } = await supabase
            .from(TABLE_NAME)
            .delete()
            .eq('id', id);
        if (error) throw error;
        console.log(`内容 ${id} 删除成功。`);
        statusElement.textContent = `内容 ${id} 已删除。`;
        showToast('删除成功', 'success');
    } catch (error) {
        console.error(`删除内容 ${id} 出错:`, error);
        statusElement.textContent = `删除内容 ${id} 出错: ${error.message}`;
        const failedButton = clipboardListElement.querySelector(`.clipboard-item[data-id='${id}'] .delete-button`);
        if(failedButton) {
            failedButton.disabled = false;
            failedButton.textContent = '删除';
        }
    }
}

// --- 处理实时更新 ---
function handleRealtimeUpdate(payload) {
    console.log('收到实时变更:', payload);
    statusElement.textContent = '收到实时更新...';
    let needsRender = false;
    if (payload.eventType === 'INSERT') {
        const newItem = payload.new;
        clipboardItems.unshift(newItem);
        console.log(`内容 ${newItem.id} 通过实时插入（已加到顶部）。`);
        statusElement.textContent = `新内容已添加。`;
        needsRender = true;
    } else if (payload.eventType === 'DELETE') {
        const deletedItemId = payload.old.id;
        const initialLength = clipboardItems.length;
        clipboardItems = clipboardItems.filter(item => item.id !== deletedItemId);
        if (clipboardItems.length < initialLength) {
            console.log(`内容 ${deletedItemId} 通过实时删除。`);
            statusElement.textContent = `内容 ${deletedItemId} 已删除。`;
            needsRender = true;
        }
    } else if (payload.eventType === 'UPDATE') {
        const updatedItem = payload.new;
        const index = clipboardItems.findIndex(item => item.id === updatedItem.id);
        if (index !== -1) {
            clipboardItems[index] = updatedItem;
            console.log(`内容 ${updatedItem.id} 通过实时更新。`);
            statusElement.textContent = `内容 ${updatedItem.id} 已更新。`;
            needsRender = true;
        }
    }
    if (needsRender) {
        renderClipboardList(clipboardItems);
    } else {
        statusElement.textContent = `实时事件 (${payload.eventType}) 已处理。`;
    }
}

// --- 设置实时订阅 ---
function setupRealtimeSubscription() {
    if (!supabase) return;
    statusElement.textContent = '正在建立实时订阅...';
    const channel = supabase.channel('public-clipboard-history');
    channel
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: TABLE_NAME
            },
            handleRealtimeUpdate
        )
        .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log('已成功订阅表的实时更新!');
                statusElement.textContent = '实时已连接，正在获取历史...';
                fetchClipboardItems();
            } else {
                console.error(`实时订阅失败或已关闭: ${status}`, err);
                statusElement.textContent = `实时错误: ${status}`;
            }
        });
    return channel;
}

// --- 主执行逻辑 ---
if (supabase && editorContainer) {
    // 1. 初始化 Quill 编辑器
    quillEditor = new Quill('#editor-container', {
        modules: {
            toolbar: [
                [{ header: [1, 2, false] }],
                ['bold', 'italic', 'underline'],
                ['image', 'code-block'],
                [{ list: 'ordered'}, { list: 'bullet' }]
            ],
            clipboard: {
                // 粘贴图片增强处理
                matchers: [
                    // 针对 <img> 标签的处理
                    ['img', (node, delta) => {
                        const src = node.getAttribute('src');
                        console.log('粘贴图片 src:', src);
                        // 处理 Base64 图片
                        if (src && src.startsWith('data:image/')) {
                            console.log('尝试上传粘贴的 Base64 图片...');
                            const blob = base64ToBlob(src);
                            if (blob) {
                                const fileName = `pasted-${Date.now()}.${blob.type.split('/')[1] || 'png'}`;
                                const file = new File([blob], fileName, { type: blob.type });
                                uploadPastedImage(file).then(imageUrl => {
                                    if (imageUrl) {
                                        delta.ops = [{ insert: { image: imageUrl } }];
                                    } else {
                                        console.warn("Base64 图片上传失败，保留原始 src。");
                                    }
                                }).catch(err => {
                                    console.error("处理 Base64 粘贴图片出错:", err);
                                });
                                return delta;
                            } else {
                                console.warn("Base64 转 Blob 失败。");
                                return delta;
                            }
                        } else if (src && src.startsWith('blob:')) {
                            console.log('尝试上传粘贴的 Blob 图片...');
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
                                        console.warn("Blob 图片上传失败，保留原始 src。");
                                    }
                                })
                                .catch(err => {
                                    console.error("处理 Blob 粘贴图片出错:", err);
                                });
                            return delta;
                        } else {
                            console.log('非 data/blob 图片，交由 Quill 默认处理:', src);
                            return delta;
                        }
                    }]
                ]
            }
        },
        placeholder: '在此粘贴或输入内容...',
        theme: 'snow'
    });
    console.log("Quill 编辑器已初始化并支持图片粘贴。");

    // --- 自定义粘贴事件处理 ---
    quillEditor.root.addEventListener('paste', async (event) => {
        console.log('检测到粘贴事件。');
        try {
            const items = await navigator.clipboard.read();
            let imageBlob = null;
            for (const item of items) {
                const imageType = item.types.find(type => type.startsWith('image/'));
                if (imageType) {
                    console.log('剪贴板中有图片数据。');
                    imageBlob = await item.getType(imageType);
                    break;
                }
            }
            if (imageBlob) {
                console.log('处理直接粘贴的图片。');
                event.preventDefault();
                const file = new File([imageBlob], `pasted-${Date.now()}.${imageBlob.type.split('/')[1] || 'png'}`, { type: imageBlob.type });
                const originalRange = quillEditor.getSelection(true);
                const imageUrl = await uploadImageFile(file);
                if (imageUrl) {
                    quillEditor.insertEmbed(originalRange.index, 'image', imageUrl);
                    quillEditor.setSelection(originalRange.index + 1);
                    statusElement.textContent = '图片粘贴上传并插入成功。';
                    console.log('图片粘贴处理成功。');
                } else {
                    statusElement.textContent = '图片上传失败。';
                    console.error('图片粘贴上传失败。');
                }
                return;
            } else {
                console.log('未检测到图片数据，交由 Quill 默认粘贴。');
            }
        } catch (err) {
            console.error('读取剪贴板出错:', err);
        }
    });

    // --- Base64 转 Blob 工具函数 ---
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
            console.error("Base64 转 Blob 出错:", e);
            return null;
        }
    }

    // --- 通用图片上传逻辑 ---
    async function uploadImageFile(file) {
        if (!file || !supabase) {
            console.log("未提供文件或 Supabase 未就绪，无法上传。");
            return null;
        }
        statusElement.textContent = '正在上传图片...';
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
            if (!urlData || !urlData.publicUrl) throw new Error("获取图片外链失败。");
            const imageUrl = urlData.publicUrl;
            console.log('图片上传成功:', imageUrl);
            statusElement.textContent = '图片上传成功。';
            return imageUrl;
        } catch (error) {
            console.error('图片上传失败:', error);
            statusElement.textContent = `图片上传失败: ${error.message}`;
            return null;
        }
    }

    // --- 粘贴图片专用上传函数 ---
    async function uploadPastedImage(file) {
        return await uploadImageFile(file);
    }

    // --- Quill 工具栏图片按钮处理 ---
    async function imageHandler() {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();
        input.onchange = async () => {
            const file = input.files[0];
            const originalRange = quillEditor.getSelection(true);
            const imageUrl = await uploadImageFile(file);
            if (imageUrl) {
                quillEditor.insertEmbed(originalRange.index, 'image', imageUrl);
                quillEditor.setSelection(originalRange.index + 1);
                statusElement.textContent = '图片上传并插入成功。';
            }
            input.value = '';
        };
    }
    quillEditor.getModule('toolbar').addHandler('image', imageHandler);

    // 2. 绑定"添加"按钮事件
    addButton.addEventListener('click', addNewItem);

    // 3. 设置实时订阅
    setupRealtimeSubscription();

    // --- 列表区事件委托 ---
    clipboardListElement.addEventListener('click', async (event) => {
        const target = event.target;
        const itemDiv = target.closest('.clipboard-item');
        if (!itemDiv) return;
        const itemId = itemDiv.dataset.id;
        const itemData = clipboardItems.find(i => i.id == itemId);
        if (!itemData) {
            console.error(`未找到 ID 为 ${itemId} 的数据`);
            return;
        }
        // 删除按钮
        if (target.classList.contains('delete-button')) {
            target.disabled = true;
            target.textContent = '删除中...';
            await deleteItem(itemId);
        }
        // 复制按钮
        else if (target.classList.contains('copy-button')) {
            let textToCopy = '';
            const copyButton = target;
            try {
                let contentData = itemData.content;
                if (typeof contentData === 'string') {
                    textToCopy = contentData;
                } else if (contentData && typeof contentData === 'object' && Array.isArray(contentData.ops)) {
                    const tempDiv = document.createElement('div');
                    const tempQuill = new Quill(tempDiv);
                    tempQuill.setContents(contentData);
                    textToCopy = tempQuill.getText().replace(/\n$/, '');
                } else {
                    textToCopy = '[不支持的内容格式]';
                }
                await navigator.clipboard.writeText(textToCopy);
                showToast('已复制到剪贴板', 'success');
                copyButton.textContent = '已复制!';
                copyButton.disabled = true;
                setTimeout(() => {
                    copyButton.textContent = '复制';
                    copyButton.disabled = false;
                }, 1500);
            } catch (err) {
                console.error('复制失败: ', err);
                showToast('复制失败', 'error');
                copyButton.textContent = '错误';
                setTimeout(() => {
                    copyButton.textContent = '复制';
                }, 1500);
            }
        }
        // 显示更多/收起按钮
        else if (target.classList.contains('show-more-button') || target.closest('.show-more-button')) {
            const btn = target.closest('.show-more-button');
            itemDiv.classList.toggle('expanded');
            if (itemDiv.classList.contains('expanded')) {
                btn.innerHTML = `收起 <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 15l-6-6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
            } else {
                btn.innerHTML = `显示更多 <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
            }
        }
    });

} else if (!editorContainer) {
    console.error("未找到 Quill 编辑器容器 '#editor-container'。");
    statusElement.textContent = '错误: 缺少编辑器 UI 元素!';
} else {
    statusElement.textContent = '无法连接后端，请查看控制台。';
}
