import { patchVideo } from 'https://compressbase.com/method-api/client.mjs';

const dropZone = document.getElementById('dropZone');
const videoInput = document.getElementById('videoInput');
const uploadPrompt = document.getElementById('uploadPrompt');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileMeta = document.getElementById('fileMeta');
const resBadge = document.getElementById('resBadge');
const changeFileBtn = document.getElementById('changeFileBtn');
const patchBtn = document.getElementById('patchBtn');
const statusCard = document.getElementById('statusCard');
const statusText = document.getElementById('statusText');
const statusPercent = document.getElementById('statusPercent');
const progressBar = document.getElementById('progressBar');
const resultCard = document.getElementById('resultCard');
const videoPreview = document.getElementById('videoPreview');
const downloadBtn = document.getElementById('downloadBtn');
const errorCard = document.getElementById('errorCard');
const errorText = document.getElementById('errorText');
const downscaleModal = document.getElementById('downscaleModal');
const confirmDownscaleBtn = document.getElementById('confirmDownscaleBtn');
const cancelDownscaleBtn = document.getElementById('cancelDownscaleBtn');
const quotaBadge = document.getElementById('quotaBadge');
const quotaText = document.getElementById('quotaText');
const quotaModal = document.getElementById('quotaModal');
const timeToReset = document.getElementById('timeToReset');
const closeQuotaModalBtn = document.getElementById('closeQuotaModalBtn');

let currentFile = null;
let videoWidth = 0;
let videoHeight = 0;
let visitorId = null;

const MAX_QUOTA = 7;
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

// Initialize Fingerprint Manager with Fallback
async function initQuotaManager() {
    try {
        if (typeof FingerprintJS !== 'undefined') {
            const fp = await FingerprintJS.load();
            const result = await fp.get();
            visitorId = result.visitorId;
        } else {
            throw new Error("FingerprintJS not loaded");
        }
    } catch (err) {
        let fallback = localStorage.getItem('_fallback_device_id');
        if (!fallback) {
            fallback = 'dev_' + Math.random().toString(36).substring(2, 12);
            localStorage.setItem('_fallback_device_id', fallback);
        }
        visitorId = fallback;
    }
    updateQuotaUI();
}

function getQuotaHistory() {
    if (!visitorId) return [];
    const data = localStorage.getItem(`quota_${visitorId}`);
    if (!data) return [];
    const timestamps = JSON.parse(data);
    const now = Date.now();
    return timestamps.filter(ts => (now - ts) < WEEK_IN_MS);
}

function updateQuotaUI() {
    const history = getQuotaHistory();
    const used = history.length;
    const remaining = Math.max(0, MAX_QUOTA - used);
    quotaText.textContent = `${remaining}/${MAX_QUOTA}`;
    quotaBadge.classList.remove('hidden');
    return remaining;
}

function recordUsage() {
    const history = getQuotaHistory();
    history.push(Date.now());
    localStorage.setItem(`quota_${visitorId}`, JSON.stringify(history));
    updateQuotaUI();
}

function getResetTimeString() {
    const history = getQuotaHistory();
    if (history.length === 0) return "0 ชั่วโมง";
    const oldest = Math.min(...history);
    const resetTime = oldest + WEEK_IN_MS;
    const diffMs = resetTime - Date.now();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    if (days > 0) return `${days} วัน ${remHours} ชั่วโมง`;
    return `${hours} ชั่วโมง`;
}

initQuotaManager();

dropZone.onclick = () => videoInput.click();
videoInput.onchange = (e) => handleFileSelect(e.target.files[0]);

dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('border-tiktokCyan'); };
dropZone.ondragleave = () => dropZone.classList.remove('border-tiktokCyan');
dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-tiktokCyan');
    if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0]);
};

changeFileBtn.onclick = (e) => {
    e.stopPropagation();
    resetState();
};

function resetState() {
    currentFile = null;
    videoInput.value = '';
    uploadPrompt.classList.remove('hidden');
    fileInfo.classList.add('hidden');
    patchBtn.disabled = true;
    resultCard.classList.add('hidden');
    errorCard.classList.add('hidden');
    statusCard.classList.add('hidden');
}

async function handleFileSelect(file) {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
        showError("กรุณาเลือกไฟล์วิดีโอเท่านั้น (.mp4 หรือ .mov)");
        return;
    }

    currentFile = file;
    fileName.textContent = file.name;
    fileMeta.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB • ${file.type}`;
    
    uploadPrompt.classList.add('hidden');
    fileInfo.classList.remove('hidden');
    errorCard.classList.add('hidden');

    resBadge.textContent = "กำลังวิเคราะห์ความละเอียด...";
    resBadge.className = "inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-800 text-gray-300";

    const videoElem = document.createElement('video');
    videoElem.preload = 'metadata';
    videoElem.src = URL.createObjectURL(file);
    videoElem.onloadedmetadata = () => {
        URL.revokeObjectURL(videoElem.src);
        videoWidth = videoElem.videoWidth;
        videoHeight = videoElem.videoHeight;

        if (videoHeight > 1080 || videoWidth > 1920) {
            resBadge.textContent = `${videoWidth}x${videoHeight} (เกิน 1080p - ระบบจะย่อให้อัตโนมัติ)`;
            resBadge.className = "inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30";
        } else {
            resBadge.textContent = `${videoWidth}x${videoHeight} (ความละเอียดเหมาะสม 1080p)`;
            resBadge.className = "inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
        }
        patchBtn.disabled = false;
    };
    videoElem.onerror = () => {
        showError("ไฟล์วิดีโอเสียหายหรือไม่รองรับรูปแบบนี้ กรุณาแปลงเป็น MP4 ก่อน");
    };
}

async function downscaleVideoIfNeeded(file) {
    if (videoHeight <= 1080 && videoWidth <= 1920) return file;

    return new Promise((resolve, reject) => {
        statusText.textContent = "Step 1/2: กำลังย่อขนาดวิดีโอลงมาที่ 1080p...";
        progressBar.style.width = "25%";
        statusPercent.textContent = "25%";

        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.muted = true;
        video.play();

        video.onloadeddata = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            let targetWidth = videoWidth;
            let targetHeight = videoHeight;

            if (videoHeight > 1080) {
                targetHeight = 1080;
                targetWidth = Math.round((videoWidth * 1080) / videoHeight);
            }

            canvas.width = targetWidth;
            canvas.height = targetHeight;

            const stream = canvas.captureStream(60);
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
            const chunks = [];

            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/mp4' });
                resolve(new File([blob], file.name, { type: 'video/mp4' }));
            };

            recorder.start();

            function drawFrame() {
                if (video.ended || video.paused) {
                    recorder.stop();
                    return;
                }
                ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
                requestAnimationFrame(drawFrame);
            }
            drawFrame();
        };
        video.onerror = () => reject(new Error("ไม่สามารถย่อขนาดวิดีโอได้"));
    });
}

patchBtn.onclick = async () => {
    const remainingQuota = updateQuotaUI();
    if (remainingQuota <= 0) {
        timeToReset.textContent = getResetTimeString();
        quotaModal.classList.remove('hidden');
        return;
    }

    if (videoHeight > 1080 || videoWidth > 1920) {
        downscaleModal.classList.remove('hidden');
    } else {
        executePatchProcess();
    }
};

confirmDownscaleBtn.onclick = () => {
    downscaleModal.classList.add('hidden');
    executePatchProcess();
};

cancelDownscaleBtn.onclick = () => downscaleModal.classList.add('hidden');
closeQuotaModalBtn.onclick = () => quotaModal.classList.add('hidden');

async function executePatchProcess() {
    patchBtn.disabled = true;
    statusCard.classList.remove('hidden');
    errorCard.classList.add('hidden');
    resultCard.classList.add('hidden');

    try {
        let fileToProcess = currentFile;

        // 1. ถ้าเกิน 1080p ให้ Downscale ก่อน
        if (videoHeight > 1080 || videoWidth > 1920) {
            fileToProcess = await downscaleVideoIfNeeded(currentFile);
        } else {
            // 2. จัดระเบียบ ArrayBuffer ป้องกัน MP4 box error
            statusText.textContent = "Step 1/2: กำลังจัดระเบียบโครงสร้างไฟล์...";
            progressBar.style.width = "30%";
            statusPercent.textContent = "30%";
            
            const arrayBuffer = await currentFile.arrayBuffer();
            fileToProcess = new File([arrayBuffer], currentFile.name, { type: 'video/mp4' });
        }

        statusText.textContent = "Step 2/2: กำลังปรับแต่ง Metadata (CompressBase API)...";
        progressBar.style.width = "70%";
        statusPercent.textContent = "70%";

        const selectedVariant = document.querySelector('input[name="variant"]:checked').value;

        const output = await patchVideo(fileToProcess, {
            postingDevice: selectedVariant,
            signal: AbortSignal.timeout(180000),
            onStatus: (msg) => {
                statusText.textContent = `กำลังประมวลผล: ${msg}`;
            }
        });

        progressBar.style.width = "100%";
        statusPercent.textContent = "100%";

        recordUsage();

        const outputUrl = URL.createObjectURL(output);
        videoPreview.src = outputUrl;
        downloadBtn.href = outputUrl;
        downloadBtn.download = `HD_${currentFile.name}`;

        setTimeout(() => {
            statusCard.classList.add('hidden');
            resultCard.classList.remove('hidden');
        }, 500);

    } catch (err) {
        statusCard.classList.add('hidden');
        showError(err.message || "เกิดข้อผิดพลาด: ไฟล์อาจมีโครงสร้าง MP4 ไม่ถูกต้อง กรุณา Export วิดีโอเป็น MP4 ใหม่อีกครั้ง");
    } finally {
        patchBtn.disabled = false;
    }
}

function showError(msg) {
    errorText.textContent = msg;
    errorCard.classList.remove('hidden');
}
