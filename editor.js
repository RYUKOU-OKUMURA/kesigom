// グローバル変数
let canvas, ctx;
let currentTool = 'eraser';
let isDrawing = false;
let originalImage = null;
let eraserSize = 30;
let history = [];
let historyStep = -1;
const maxHistory = 20;
let textObjects = [];
let selectedTextId = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let isResizingText = false;
let resizeStartX = 0;
let resizeStartY = 0;
let initialFontSize = 0;
let savedState = null;
let isPinching = false;
let lastPinchDistance = 0;
let baseCanvas = null;  // 消しゴムで編集された状態を保持するキャンバス
let baseCtx = null;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    
    // ベースキャンバスを作成（消しゴムで編集された状態を保持）
    baseCanvas = document.createElement('canvas');
    baseCtx = baseCanvas.getContext('2d');
    
    // 消しゴムカーソル要素を作成
    createEraserCursor();
    
    // イベントリスナー設定
    document.getElementById('upload').addEventListener('change', handleImageUpload);
    document.getElementById('eraserTool').addEventListener('click', () => selectTool('eraser'));
    document.getElementById('textTool').addEventListener('click', () => selectTool('text'));
    document.getElementById('downloadBtn').addEventListener('click', downloadImage);
    document.getElementById('addText').addEventListener('click', addText);
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('saveBtn').addEventListener('click', saveTemporary);
    document.getElementById('loadBtn').addEventListener('click', loadTemporary);
    
    // Ctrl+Z / Cmd+Z でも元に戻せるように
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            undo();
        }
    });
    
    // フォントサイズスライダーのイベント
    document.getElementById('fontSize').addEventListener('input', (e) => {
        document.getElementById('fontSizeValue').textContent = e.target.value;
    });
    
    document.getElementById('editFontSize').addEventListener('input', (e) => {
        document.getElementById('editFontSizeValue').textContent = e.target.value;
    });
    
    // 消しゴムサイズスライダーのイベント
    document.getElementById('eraserSize').addEventListener('input', (e) => {
        eraserSize = parseInt(e.target.value);
        document.getElementById('eraserSizeValue').textContent = eraserSize;
        updateEraserCursorSize();
    });
    
    // テキスト編集パネルのイベント
    document.getElementById('updateText').addEventListener('click', updateTextObject);
    document.getElementById('deleteText').addEventListener('click', deleteTextObject);
    document.getElementById('closeEdit').addEventListener('click', closeEditPanel);
    
    // Canvas イベント
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseout', stopDrawing);
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('dblclick', handleDoubleClick);
    
    // タッチイベント（ピンチジェスチャー用）
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', handleTouchEnd);
    
    // マウス移動時のカーソル追従
    canvas.addEventListener('mousemove', updateEraserCursor);
    canvas.addEventListener('mouseenter', showEraserCursor);
    canvas.addEventListener('mouseleave', hideEraserCursor);
    
    // テキスト入力エンターキー対応
    document.getElementById('textBox').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addText();
        }
    });
    
    // 閉じるボタンのイベント
    document.getElementById('closeTextInput').addEventListener('click', () => {
        document.getElementById('textInput').style.display = 'none';
    });
    
    // ポップアップ外クリックで閉じる
    document.addEventListener('click', (e) => {
        const textInput = document.getElementById('textInput');
        if (!textInput.contains(e.target) && e.target.id !== 'canvas') {
            textInput.style.display = 'none';
        }
    });
});

// 消しゴムカーソルの作成
function createEraserCursor() {
    const cursor = document.createElement('div');
    cursor.id = 'eraserCursor';
    cursor.style.position = 'absolute';
    cursor.style.width = eraserSize + 'px';
    cursor.style.height = eraserSize + 'px';
    cursor.style.border = '2px solid #000';
    cursor.style.borderRadius = '50%';
    cursor.style.pointerEvents = 'none';
    cursor.style.display = 'none';
    cursor.style.zIndex = '1000';
    cursor.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
    document.body.appendChild(cursor);
}

// 消しゴムカーソルの更新
function updateEraserCursor(e) {
    if (currentTool !== 'eraser') return;
    
    const cursor = document.getElementById('eraserCursor');
    cursor.style.left = (e.pageX - eraserSize/2) + 'px';
    cursor.style.top = (e.pageY - eraserSize/2) + 'px';
}

// 消しゴムカーソルのサイズ更新
function updateEraserCursorSize() {
    const cursor = document.getElementById('eraserCursor');
    cursor.style.width = eraserSize + 'px';
    cursor.style.height = eraserSize + 'px';
}

// 消しゴムカーソルの表示
function showEraserCursor() {
    if (currentTool === 'eraser') {
        document.getElementById('eraserCursor').style.display = 'block';
    }
}

// 消しゴムカーソルの非表示
function hideEraserCursor() {
    document.getElementById('eraserCursor').style.display = 'none';
}

// 画像アップロード
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // 全状態をリセット
    textObjects = [];
    selectedTextId = null;
    history = [];
    historyStep = -1;
    savedState = null;
    localStorage.removeItem('tempSavedState');
    document.getElementById('loadBtn').disabled = true;
    
    const reader = new FileReader();
    
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            // Canvas サイズを画像に合わせる
            canvas.width = img.width;
            canvas.height = img.height;
            baseCanvas.width = img.width;
            baseCanvas.height = img.height;
            
            // 画像を描画
            ctx.drawImage(img, 0, 0);
            baseCtx.drawImage(img, 0, 0);
            
            // 元画像を保存
            originalImage = img;
            
            // 編集エリアを表示
            document.getElementById('editorArea').style.display = 'block';
            
            // 初期状態を履歴に保存
            saveState();
        }
        img.src = event.target.result;
    }
    reader.readAsDataURL(file);
}

// 履歴管理
function saveState() {
    // 現在の状態より先の履歴を削除
    history = history.slice(0, historyStep + 1);
    
    // 現在の状態を保存（キャンバスデータとテキストオブジェクト）
    const state = {
        canvasData: canvas.toDataURL(),
        baseCanvasData: baseCanvas.toDataURL(),
        textObjects: JSON.parse(JSON.stringify(textObjects))
    };
    
    history.push(state);
    historyStep++;
    
    // 履歴の最大数を超えたら古いものを削除
    if (history.length > maxHistory) {
        history.shift();
        historyStep--;
    }
    
    // Undoボタンの有効/無効を更新
    updateUndoButton();
}

function undo() {
    if (historyStep > 0) {
        historyStep--;
        const state = history[historyStep];
        
        // テキストオブジェクトを復元
        textObjects = JSON.parse(JSON.stringify(state.textObjects));
        selectedTextId = null;
        
        // ベースキャンバスを復元
        const baseImg = new Image();
        baseImg.onload = function() {
            baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
            baseCtx.drawImage(baseImg, 0, 0);
            
            // メインキャンバスを復元
            const img = new Image();
            img.onload = function() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                updateUndoButton();
            }
            img.src = state.canvasData;
        }
        baseImg.src = state.baseCanvasData;
    }
}

function updateUndoButton() {
    const undoBtn = document.getElementById('undoBtn');
    undoBtn.disabled = historyStep <= 0;
}

// ツール選択
function selectTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tool + 'Tool').classList.add('active');
    
    // 消しゴムサイズコントロールの表示/非表示
    const eraserSizeControl = document.getElementById('eraserSizeControl');
    if (tool === 'eraser') {
        eraserSizeControl.style.display = 'block';
    } else {
        eraserSizeControl.style.display = 'none';
    }
    
    // カーソル変更と消しゴムカーソル表示制御
    if (tool === 'eraser') {
        canvas.style.cursor = 'none'; // デフォルトカーソルを非表示
        showEraserCursor();
    } else {
        canvas.style.cursor = 'text';
        hideEraserCursor();
    }
}

// マウスイベントハンドラ
function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    if (currentTool === 'eraser') {
        startDrawing(e);
    } else if (currentTool === 'text') {
        // リサイズハンドルをクリックしたか確認
        const resizeHandle = getResizeHandleAtPosition(x, y);
        if (resizeHandle) {
            isResizingText = true;
            selectedTextId = resizeHandle.textId;
            resizeStartX = x;
            resizeStartY = y;
            const textObj = textObjects.find(t => t.id === resizeHandle.textId);
            initialFontSize = parseInt(textObj.fontSize);
            redrawCanvas();
        } else {
            // テキストオブジェクトをクリックしたか確認
            const clickedText = getTextAtPosition(x, y);
            if (clickedText) {
                selectedTextId = clickedText.id;
                isDragging = true;
                dragOffset.x = x - clickedText.x;
                dragOffset.y = y - clickedText.y;
                redrawCanvas();
            }
        }
    }
}

function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    if (currentTool === 'eraser' && isDrawing) {
        draw(e);
    } else if (currentTool === 'text') {
        if (isResizingText && selectedTextId) {
            // テキストサイズをリサイズ
            const textObj = textObjects.find(t => t.id === selectedTextId);
            if (textObj) {
                // ドラッグ距離に基づいてフォントサイズを計算
                const distance = Math.sqrt(Math.pow(x - resizeStartX, 2) + Math.pow(y - resizeStartY, 2));
                const direction = (x > resizeStartX || y > resizeStartY) ? 1 : -1;
                const sizeChange = direction * distance * 0.5;
                const newSize = Math.max(12, Math.min(100, initialFontSize + sizeChange));
                textObj.fontSize = Math.round(newSize);
                redrawCanvas();
            }
        } else if (isDragging && selectedTextId) {
            // テキストをドラッグ
            const textObj = textObjects.find(t => t.id === selectedTextId);
            if (textObj) {
                textObj.x = x - dragOffset.x;
                textObj.y = y - dragOffset.y;
                redrawCanvas();
            }
        }
    }
    
    // カーソル更新
    if (currentTool === 'eraser') {
        updateEraserCursor(e);
    } else if (currentTool === 'text') {
        // リサイズハンドル上でカーソルを変更
        const resizeHandle = getResizeHandleAtPosition(x, y);
        if (resizeHandle) {
            canvas.style.cursor = 'nwse-resize';
        } else {
            canvas.style.cursor = 'text';
        }
    }
}

function handleMouseUp(e) {
    if (currentTool === 'eraser') {
        stopDrawing();
    } else if (currentTool === 'text') {
        if (isDragging || isResizingText) {
            isDragging = false;
            isResizingText = false;
            saveState();
        }
    }
}

// ダブルクリックでテキスト編集
function handleDoubleClick(e) {
    if (currentTool !== 'text') return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const clickedText = getTextAtPosition(x, y);
    if (clickedText) {
        openEditPanel(clickedText);
    }
}

// 消しゴム機能
function startDrawing(e) {
    isDrawing = true;
    
    // キャンバスのスケールを考慮した座標計算
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const smartEraser = document.getElementById('smartEraser').checked;
    
    if (smartEraser) {
        // スマート消去モード（背景色を保持）
        smartErase(x, y);
    } else {
        // 通常の消去モード
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, eraserSize/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        
        baseCtx.globalCompositeOperation = 'destination-out';
        baseCtx.beginPath();
        baseCtx.arc(x, y, eraserSize/2, 0, Math.PI * 2);
        baseCtx.fill();
        baseCtx.globalCompositeOperation = 'source-over';
    }
}

function draw(e) {
    if (!isDrawing || currentTool !== 'eraser') return;
    
    // キャンバスのスケールを考慮した座標計算
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const smartEraser = document.getElementById('smartEraser').checked;
    
    if (smartEraser) {
        // スマート消去モード（背景色を保持）
        smartErase(x, y);
    } else {
        // 通常の消去モード
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, eraserSize/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        
        baseCtx.globalCompositeOperation = 'destination-out';
        baseCtx.beginPath();
        baseCtx.arc(x, y, eraserSize/2, 0, Math.PI * 2);
        baseCtx.fill();
        baseCtx.globalCompositeOperation = 'source-over';
    }
}

function stopDrawing() {
    if (isDrawing && currentTool === 'eraser') {
        // 消しゴムを使い終わったら状態を保存
        saveState();
    }
    isDrawing = false;
}

// テキスト追加
function handleCanvasClick(e) {
    if (currentTool !== 'text') return;
    if (isDrawing || isDragging) return; // 消しゴム使用中やドラッグ中は無視
    
    // キャンバスのスケールを考慮した座標計算
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // クリックがテキストオブジェクト上でない場合のみ新規追加
    const clickedText = getTextAtPosition(x, y);
    if (!clickedText) {
        // テキスト入力ボックス表示
        const textInput = document.getElementById('textInput');
        textInput.style.display = 'block';
        textInput.style.left = e.clientX + 'px';
        textInput.style.top = e.clientY + 'px';
        textInput.dataset.x = x;
        textInput.dataset.y = y;
        
        // テキストボックスをクリアしてフォーカス
        document.getElementById('textBox').value = '';
        document.getElementById('textBox').focus();
    }
}

function addText() {
    const textInput = document.getElementById('textInput');
    const text = document.getElementById('textBox').value;
    const x = parseInt(textInput.dataset.x);
    const y = parseInt(textInput.dataset.y);
    
    if (text) {
        // フォント設定を取得
        const fontSize = document.getElementById('fontSize').value;
        const fontWeight = document.getElementById('fontWeight').value;
        const fontColor = document.getElementById('fontColor').value;
        const fontFamily = document.getElementById('fontFamily').value;
        const textAlign = document.getElementById('textAlign').value;
        
        // テキストを改行で分割
        const lines = text.split('\n');
        
        // テキストオブジェクトを作成
        const textObj = {
            id: Date.now(),
            text: text,
            lines: lines,
            x: x,
            y: y,
            fontSize: fontSize,
            fontWeight: fontWeight,
            fontFamily: fontFamily,
            color: fontColor,
            textAlign: textAlign
        };
        
        textObjects.push(textObj);
        
        // キャンバスを再描画
        redrawCanvas();
        
        // 入力ボックスを隠す
        document.getElementById('textBox').value = '';
        textInput.style.display = 'none';
        
        // テキスト追加後に状態を保存
        saveState();
    }
}

// キャンバスの再描画
function redrawCanvas() {
    // 背景画像またはクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // ベースキャンバス（消しゴムで編集済みの状態）を描画
    if (baseCanvas) {
        ctx.drawImage(baseCanvas, 0, 0);
    }
    
    // 全てのテキストオブジェクトを描画
    textObjects.forEach(textObj => {
        ctx.save();
        
        // フォント設定
        const fontStyle = textObj.fontWeight === '700' ? 'bold' : 'normal';
        ctx.font = `${fontStyle} ${textObj.fontSize}px ${textObj.fontFamily}`;
        ctx.fillStyle = textObj.color || 'black';
        ctx.textAlign = textObj.textAlign || 'left';
        ctx.textBaseline = 'middle';
        
        // 複数行テキストの描画
        const lines = textObj.lines || [textObj.text];
        const lineHeight = parseInt(textObj.fontSize) * 1.2;
        
        lines.forEach((line, index) => {
            const lineY = textObj.y + (index * lineHeight) - ((lines.length - 1) * lineHeight / 2);
            ctx.fillText(line, textObj.x, lineY);
        });
        
        // 選択中のテキストに枠とリサイズハンドルを描画
        if ((isDragging || isResizingText) && selectedTextId === textObj.id) {
            const lines = textObj.lines || [textObj.text];
            const lineHeight = parseInt(textObj.fontSize) * 1.2;
            const totalHeight = lines.length * lineHeight;
            
            // 最大幅を計算
            let maxWidth = 0;
            lines.forEach(line => {
                const metrics = ctx.measureText(line);
                maxWidth = Math.max(maxWidth, metrics.width);
            });
            
            const padding = 5;
            
            // 枠を描画
            ctx.strokeStyle = '#2196F3';
            ctx.lineWidth = 2;
            let boxX, boxWidth;
            
            // 配置に応じて枠の位置を調整
            if (textObj.textAlign === 'center') {
                boxX = textObj.x - maxWidth/2 - padding;
            } else if (textObj.textAlign === 'right') {
                boxX = textObj.x - maxWidth - padding;
            } else {
                boxX = textObj.x - padding;
            }
            
            const boxY = textObj.y - totalHeight/2 - padding;
            boxWidth = maxWidth + padding * 2;
            const boxHeight = totalHeight + padding * 2;
            
            ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
            
            // リサイズハンドルを描画（右下）
            const handleSize = 10;
            const handleX = boxX + boxWidth - handleSize/2;
            const handleY = boxY + boxHeight - handleSize/2;
            
            ctx.fillStyle = '#2196F3';
            ctx.fillRect(handleX, handleY, handleSize, handleSize);
            
            // リサイズ中は現在のフォントサイズを表示
            if (isResizingText) {
                ctx.save();
                ctx.font = '12px sans-serif';
                ctx.fillStyle = '#2196F3';
                ctx.fillText(`${textObj.fontSize}px`, boxX, boxY - 5);
                ctx.restore();
            }
        }
        
        ctx.restore();
    });
}

// 指定位置のテキストオブジェクトを取得
function getTextAtPosition(x, y) {
    // 逆順で検索（最前面から）
    for (let i = textObjects.length - 1; i >= 0; i--) {
        const textObj = textObjects[i];
        ctx.save();
        
        // フォント設定
        const fontStyle = textObj.fontWeight === '700' ? 'bold' : 'normal';
        ctx.font = `${fontStyle} ${textObj.fontSize}px ${textObj.fontFamily}`;
        ctx.textAlign = textObj.textAlign || 'left';
        
        // 複数行テキストの境界ボックスを計算
        const lines = textObj.lines || [textObj.text];
        const lineHeight = parseInt(textObj.fontSize) * 1.2;
        const totalHeight = lines.length * lineHeight;
        
        // 最大幅を計算
        let maxWidth = 0;
        lines.forEach(line => {
            const metrics = ctx.measureText(line);
            maxWidth = Math.max(maxWidth, metrics.width);
        });
        
        ctx.restore();
        
        // テキストの境界ボックス内かチェック（複数行対応）
        const padding = 5;
        let boxX;
        
        // 配置に応じて境界ボックスの位置を調整
        if (textObj.textAlign === 'center') {
            boxX = textObj.x - maxWidth/2 - padding;
        } else if (textObj.textAlign === 'right') {
            boxX = textObj.x - maxWidth - padding;
        } else {
            boxX = textObj.x - padding;
        }
        
        const boxY = textObj.y - totalHeight/2 - padding;
        const boxWidth = maxWidth + padding * 2;
        const boxHeight = totalHeight + padding * 2;
        
        if (x >= boxX && x <= boxX + boxWidth &&
            y >= boxY && y <= boxY + boxHeight) {
            return textObj;
        }
    }
    return null;
}

// 指定位置のリサイズハンドルを取得
function getResizeHandleAtPosition(x, y) {
    // 逆順で検索（最前面から）
    for (let i = textObjects.length - 1; i >= 0; i--) {
        const textObj = textObjects[i];
        ctx.save();
        
        // フォント設定
        const fontStyle = textObj.fontWeight === '700' ? 'bold' : 'normal';
        ctx.font = `${fontStyle} ${textObj.fontSize}px ${textObj.fontFamily}`;
        ctx.textAlign = textObj.textAlign || 'left';
        
        // 複数行テキストの境界ボックスを計算
        const lines = textObj.lines || [textObj.text];
        const lineHeight = parseInt(textObj.fontSize) * 1.2;
        const totalHeight = lines.length * lineHeight;
        
        // 最大幅を計算
        let maxWidth = 0;
        lines.forEach(line => {
            const metrics = ctx.measureText(line);
            maxWidth = Math.max(maxWidth, metrics.width);
        });
        
        ctx.restore();
        
        // リサイズハンドルの位置を計算（複数行対応）
        const padding = 5;
        let boxX, boxWidth;
        
        // 配置に応じて枠の位置を調整
        if (textObj.textAlign === 'center') {
            boxX = textObj.x - maxWidth/2 - padding;
        } else if (textObj.textAlign === 'right') {
            boxX = textObj.x - maxWidth - padding;
        } else {
            boxX = textObj.x - padding;
        }
        
        const boxY = textObj.y - totalHeight/2 - padding;
        boxWidth = maxWidth + padding * 2;
        const boxHeight = totalHeight + padding * 2;
        
        const handleSize = 10;
        const handleX = boxX + boxWidth - handleSize/2;
        const handleY = boxY + boxHeight - handleSize/2;
        
        // リサイズハンドル内かチェック
        if (x >= handleX && x <= handleX + handleSize &&
            y >= handleY && y <= handleY + handleSize) {
            return { textId: textObj.id };
        }
    }
    return null;
}

// テキスト編集パネルを開く
function openEditPanel(textObj) {
    const panel = document.getElementById('textEditPanel');
    document.getElementById('editTextBox').value = textObj.text;
    document.getElementById('editFontSize').value = textObj.fontSize;
    document.getElementById('editFontSizeValue').textContent = textObj.fontSize;
    document.getElementById('editFontWeight').value = textObj.fontWeight;
    document.getElementById('editFontFamily').value = textObj.fontFamily || "'Noto Sans JP', sans-serif";
    document.getElementById('editFontColor').value = textObj.color || '#000000';
    document.getElementById('editTextAlign').value = textObj.textAlign || 'left';
    
    panel.dataset.textId = textObj.id;
    panel.style.display = 'block';
}

// テキストオブジェクトを更新
function updateTextObject() {
    const panel = document.getElementById('textEditPanel');
    const textId = parseInt(panel.dataset.textId);
    const textObj = textObjects.find(t => t.id === textId);
    
    if (textObj) {
        saveState();
        
        const newText = document.getElementById('editTextBox').value;
        textObj.text = newText;
        textObj.lines = newText.split('\n');
        textObj.fontSize = document.getElementById('editFontSize').value;
        textObj.fontWeight = document.getElementById('editFontWeight').value;
        textObj.fontFamily = document.getElementById('editFontFamily').value;
        textObj.color = document.getElementById('editFontColor').value;
        textObj.textAlign = document.getElementById('editTextAlign').value;
        
        redrawCanvas();
        closeEditPanel();
    }
}

// テキストオブジェクトを削除
function deleteTextObject() {
    const panel = document.getElementById('textEditPanel');
    const textId = parseInt(panel.dataset.textId);
    
    saveState();
    
    textObjects = textObjects.filter(t => t.id !== textId);
    selectedTextId = null;
    
    redrawCanvas();
    closeEditPanel();
}

// 編集パネルを閉じる
function closeEditPanel() {
    document.getElementById('textEditPanel').style.display = 'none';
}

// ダウンロード
function downloadImage() {
    // 白背景を追加したキャンバスを作成
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    
    // 白背景を描画
    tempCtx.fillStyle = 'white';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // 編集した画像を上に重ねる
    tempCtx.drawImage(canvas, 0, 0);
    
    // ダウンロード
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
    link.download = `edited-image-${timestamp}.png`;
    link.href = tempCanvas.toDataURL();
    link.click();
}

// 一時保存機能
function saveTemporary() {
    savedState = {
        canvasData: canvas.toDataURL(),
        baseCanvasData: baseCanvas.toDataURL(),
        textObjects: JSON.parse(JSON.stringify(textObjects))
    };
    
    // ローカルストレージに保存
    localStorage.setItem('tempSavedState', JSON.stringify(savedState));
    
    // 読み込みボタンを有効化
    document.getElementById('loadBtn').disabled = false;
    
    alert('一時保存しました');
    
    // 自動で読み込み処理を実行
    loadTemporary();
}

function loadTemporary() {
    const saved = localStorage.getItem('tempSavedState');
    if (saved) {
        savedState = JSON.parse(saved);
        
        // まず保存された画像からキャンバスサイズを取得
        const tempImg = new Image();
        tempImg.onload = function() {
            // キャンバスサイズを設定
            canvas.width = tempImg.width;
            canvas.height = tempImg.height;
            baseCanvas.width = tempImg.width;
            baseCanvas.height = tempImg.height;
            
            // テキストオブジェクトを復元
            textObjects = JSON.parse(JSON.stringify(savedState.textObjects));
            selectedTextId = null;
            
            // ベースキャンバスを復元
            const baseImg = new Image();
            baseImg.onload = function() {
                baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
                baseCtx.drawImage(baseImg, 0, 0);
                
                // キャンバスを復元（テキストを含む状態に再描画）
                redrawCanvas();
                
                // 現在の状態を履歴に保存
                saveState();
                
                // 編集エリアを表示（画像がロードされていない場合）
                document.getElementById('editorArea').style.display = 'block';
            }
            baseImg.src = savedState.baseCanvasData;
        }
        tempImg.src = savedState.canvasData;
    }
}

// タッチイベントハンドラ（ピンチジェスチャー用）
function handleTouchStart(e) {
    if (currentTool !== 'text') return;
    
    if (e.touches.length === 2) {
        e.preventDefault();
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        // 2本指の中心点を計算
        const centerX = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) * scaleX;
        const centerY = ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top) * scaleY;
        
        // 中心点のテキストを選択
        const textObj = getTextAtPosition(centerX, centerY);
        if (textObj) {
            selectedTextId = textObj.id;
            isPinching = true;
            
            // 初期の距離を計算
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastPinchDistance = Math.sqrt(dx * dx + dy * dy);
        }
    }
}

function handleTouchMove(e) {
    if (isPinching && e.touches.length === 2 && selectedTextId) {
        e.preventDefault();
        
        // 現在の距離を計算
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);
        
        // 距離の変化率を計算
        const scale = currentDistance / lastPinchDistance;
        
        // 選択されたテキストのフォントサイズを変更
        const textObj = textObjects.find(t => t.id === selectedTextId);
        if (textObj) {
            const newSize = parseInt(textObj.fontSize) * scale;
            // サイズを制限（12〜100px）
            textObj.fontSize = Math.max(12, Math.min(100, Math.round(newSize)));
            
            redrawCanvas();
        }
        
        lastPinchDistance = currentDistance;
    }
}

function handleTouchEnd(e) {
    if (isPinching) {
        isPinching = false;
        selectedTextId = null;
        saveState();
        redrawCanvas();
    }
}

// 初期化時に読み込みボタンの状態を設定
window.addEventListener('load', () => {
    const saved = localStorage.getItem('tempSavedState');
    document.getElementById('loadBtn').disabled = !saved;
});


// スマート消去機能（背景色を保持）
function smartErase(centerX, centerY) {
    const radius = eraserSize / 2;
    
    // 消去エリアの境界を計算
    const x = Math.max(0, Math.floor(centerX - radius));
    const y = Math.max(0, Math.floor(centerY - radius));
    const width = Math.min(canvas.width - x, Math.ceil(radius * 2));
    const height = Math.min(canvas.height - y, Math.ceil(radius * 2));
    
    // 消去エリアの画像データを取得
    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;
    
    // エリア周辺の背景色をサンプリング
    const bgColors = sampleBackgroundColors(centerX, centerY, radius * 2);
    
    // 各ピクセルを処理
    for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
            // 円形マスク内かチェック
            const dx = (x + px) - centerX;
            const dy = (y + py) - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= radius) {
                const i = (py * width + px) * 4;
                
                // 現在のピクセルの色
                const currentColor = [data[i], data[i + 1], data[i + 2]];
                
                // 最も近い背景色を見つける
                const bgColor = findClosestBackgroundColor(currentColor, bgColors);
                
                // 色の差を計算
                const colorDiff = Math.abs(currentColor[0] - bgColor[0]) + 
                                Math.abs(currentColor[1] - bgColor[1]) + 
                                Math.abs(currentColor[2] - bgColor[2]);
                
                // 背景色と大きく異なる場合（テキストやイラストの可能性）
                if (colorDiff > 50) {
                    // 背景色で置き換え
                    data[i] = bgColor[0];
                    data[i + 1] = bgColor[1];
                    data[i + 2] = bgColor[2];
                }
            }
        }
    }
    
    // 編集したデータを適用
    ctx.putImageData(imageData, x, y);
    baseCtx.putImageData(imageData, x, y);
}

// 背景色のサンプリング
function sampleBackgroundColors(centerX, centerY, sampleRadius) {
    const colors = [];
    const samplePoints = 8; // サンプリングポイント数
    
    for (let i = 0; i < samplePoints; i++) {
        const angle = (i / samplePoints) * Math.PI * 2;
        const sx = Math.round(centerX + Math.cos(angle) * sampleRadius);
        const sy = Math.round(centerY + Math.sin(angle) * sampleRadius);
        
        // キャンバス内のポイントのみサンプリング
        if (sx >= 0 && sx < canvas.width && sy >= 0 && sy < canvas.height) {
            const pixel = ctx.getImageData(sx, sy, 1, 1).data;
            colors.push([pixel[0], pixel[1], pixel[2]]);
        }
    }
    
    return colors;
}

// 最も近い背景色を見つける
function findClosestBackgroundColor(targetColor, bgColors) {
    if (bgColors.length === 0) return targetColor;
    
    let minDiff = Infinity;
    let closestColor = bgColors[0];
    
    for (const bgColor of bgColors) {
        const diff = Math.abs(targetColor[0] - bgColor[0]) + 
                    Math.abs(targetColor[1] - bgColor[1]) + 
                    Math.abs(targetColor[2] - bgColor[2]);
        
        if (diff < minDiff) {
            minDiff = diff;
            closestColor = bgColor;
        }
    }
    
    return closestColor;
}

