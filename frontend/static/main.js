function showToast(message) {
    const toast = document.querySelector(".toast");
    const toastMessage = document.getElementById("toast-message");
    toastMessage.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}


let keyboardListener = null;

async function openViewer(filename) {
    const wrapper = document.querySelector("#viewer");
    wrapper.classList.remove("hidden");

    const viewer = document.getElementById("viewer-content");
    viewer.innerHTML = "Loading...";
    const file = await fetch(`/data/file/${filename}`);
    const blob = await file.blob();
    if (blob.type.startsWith("image/")) {
        const imageUrl = URL.createObjectURL(blob);
        viewer.innerHTML = `<img src="${imageUrl}" alt="Image Viewer" class="viewer-image">`;
    } else if (blob.type === "application/pdf") {
        const pdfUrl = URL.createObjectURL(blob);
        viewer.innerHTML = `<embed src="${pdfUrl}" type="application/pdf" class="viewer-pdf" />`;
    } else if (blob.type.startsWith("video/")) {
        const videoUrl = URL.createObjectURL(blob);
        viewer.innerHTML = `<video controls class="viewer-video"><source src="${videoUrl}" type="${blob.type}">Your browser does not support the video tag.</video>`;
    } else {
        viewer.innerHTML = "<img src='/static/icon/cloud-off.svg' alt='File Icon' class='viewer-file-icon viewer-error' />";
    }

    const filenameDiv = document.getElementById("viewer-filename");
    filenameDiv.textContent = filename;

    if (keyboardListener) {
        window.removeEventListener("keydown", keyboardListener);
    }

    keyboardListener = function handler(event) {
        if (event.key === "ArrowRight") {
            nextFile();
        } else if (event.key === "ArrowLeft") {
            prevFile();
        } else if (event.key === "Escape") {
            closeViewer();
            window.removeEventListener("keydown", handler);
        }
    };
    window.addEventListener("keydown", keyboardListener);
}

function closeViewer() {
    const wrapper = document.querySelector(".viewer-wrapper");
    wrapper.classList.add("hidden");
    const viewer = document.getElementById("viewer-content");
    viewer.innerHTML = "";

    window.removeEventListener("keydown", keyboardListener);
    keyboardListener = null;
}

async function editFilename() {
    const wrapper = document.getElementById("filename-editor");
    wrapper.classList.remove("hidden");
}

function closeEditFilename() {
    const wrapper = document.getElementById("filename-editor");
    wrapper.classList.add("hidden");
}

async function saveFilename() {
    const currentFilename = document.getElementById("viewer-filename").textContent;
    const newFilename = document.getElementById("new-filename-input").value;
    res = await fetch(`/data/file/${currentFilename}`, {
        method: "PUT",
        body: JSON.stringify({ new_filename: newFilename }),
        headers: {
            'Content-Type': 'application/json'
        }
    });
    if (res.status === 200) {
        showToast("Filename updated successfully!");
        document.getElementById("viewer-filename").textContent = newFilename;
        loadedFiles = 0;
        getFileList();
        document.getElementById("new-filename-input").value = '';
        closeEditFilename();
    } else {
        showToast("Filename update failed.");
    }
}

async function addFile() {
    files = document.getElementById("fileInput").files;
    if (files.length > 0) {
        for (const file of files) {
            // console.log("Selected file:", file.name);
            let formData = new FormData();
            formData.append("files", file);

            res = await fetch("/data/add", {
                method: "POST",
                body: formData
            });
            if (res.status === 200) {
                showToast("File uploaded successfully!");
            } else {
                showToast("File upload failed.");
            }
        }
    }
    document.getElementById("fileInput").value = '';
    loadMoreFiles();
    getAppInfo();
}

async function deleteFile() {
    const filename = document.getElementById("viewer-filename").textContent;
    res = await fetch(`/data/file/${filename}`, {
        method: "DELETE"
    });
    if (res.status === 200) {
        showToast("File deleted successfully!");
        closeViewer();
        loadedFiles = 0;
        getFileList();
    } else {
        showToast("File deletion failed.");
    }
}

async function downloadFile() {
    const file = document.getElementById("viewer-content").querySelector("img, video, embed");
    const filename = document.getElementById("viewer-filename").textContent;
    const link = file.attributes['src'].value
    const a = document.createElement('a');
    a.href = link;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

async function nextFile() {
    const currentFilename = document.getElementById("viewer-filename").textContent;
    const list = document.getElementById("file-list").children;
    for (let i = 0; i < list.length; i++) {
        const fileDiv = list[i];
        const filenameDiv = fileDiv.querySelector(".filename");
        const fname = filenameDiv.getAttribute("filename");
        if (fname === currentFilename) {
            if (i + 1 < list.length) {
                const nextFilename = list[i + 1].querySelector(".filename").getAttribute("filename");
                await openViewer(nextFilename);
            }
            break;
        }
    }
}

async function prevFile() {
    const currentFilename = document.getElementById("viewer-filename").textContent;
    const list = document.getElementById("file-list").children;
    for (let i = 0; i < list.length; i++) {
        const fileDiv = list[i];
        const filenameDiv = fileDiv.querySelector(".filename");
        fname = filenameDiv.getAttribute("filename");
        if (fname === currentFilename) {
            if (i - 1 >= 0) {
                const prevFilename = list[i - 1].querySelector(".filename").getAttribute("filename");
                await openViewer(prevFilename);
            }
            break;
        }
    }
}

async function getThumbnail(filename) {
    thumb = await fetch(`/data/thumbnail/${filename}`);
    blob = await thumb.blob();
    return URL.createObjectURL(blob);
}

let loadedFiles = 0;
let maxFiles = 0;
let isLoading = false;

async function getFileList(start=0, end=30) {
    list = await fetch(`/data/list?start=${start}&end=${end}`);
    data = await list.json();
    const fileListDiv = document.getElementById("file-list");
    fileListDiv.innerHTML = "";

    for (const file of data) {
        (async function() {
            const filediv = document.createElement("div");
            filediv.className = "file";
            filediv.onclick = () => openViewer(file['filename']);
            const thumbnailUrl = await getThumbnail(file['filename']);
            const fname = file['filename'];
            if (fname.length > 10) {
                displayName = fname.substring(0, 10) + "..." + fname.substring(fname.length - 10);
            } else {
                displayName = fname;
            }
            filediv.innerHTML = `<img loading="lazy" src="${thumbnailUrl}" onerror="this.src='/static/icon/cloud-off.svg';this.classList.add('thumb-error');" alt="Thumbnail" class="thumbnail"><div class="filename" filename="${fname}">${displayName}</div>`;
            fileListDiv.appendChild(filediv);
        })();
    }
    loadedFiles += data.length;
    maxFiles = await fetch('/data/count')
    maxFiles = await maxFiles.json();
    maxFiles = maxFiles['count'];
}

let fetchTries = 101;

async function loadMoreFiles() {
    fetchTries += 1;
    if (fetchTries > 100) {
        maxFiles = await fetch('/data/count')
        maxFiles = await maxFiles.json();
        maxFiles = maxFiles['count'];
        fetchTries = 0;
    }
    if (isLoading || loadedFiles === maxFiles) return;
    isLoading = true;

    const fileListDiv = document.getElementById("file-list");
    list = await fetch(`/data/list?start=${loadedFiles}&end=${loadedFiles + 20}`);
    data = await list.json();

    for (const file of data) {
        (async function() {
            const filediv = document.createElement("div");
            filediv.className = "file";
            filediv.onclick = () => openViewer(file['filename']);
            const thumbnailUrl = await getThumbnail(file['filename']);
            const fname = file['filename'];
            if (fname.length > 10) {
                displayName = fname.substring(0, 10) + "..." + fname.substring(fname.length - 10);
            } else {
                displayName = fname;
            }
            filediv.innerHTML = `<img loading="lazy" src="${thumbnailUrl}" onerror="this.src='/static/icon/cloud-off.svg';this.classList.add('thumb-error');" alt="Thumbnail" class="thumbnail"><div class="filename" filename="${fname}">${displayName}</div>`;
            fileListDiv.appendChild(filediv);
        })();
    }
    loadedFiles += data.length;

    if (loadedFiles > maxFiles) {
        maxFiles = await fetch('/data/count')
        maxFiles = await maxFiles.json();
        maxFiles = maxFiles['count'];
    }

    isLoading = false;
}

window.addEventListener("scroll", async function() {
    scrollHeight = window.scrollY + window.innerHeight;
    pageHeight = document.documentElement.scrollHeight;
    scrolled = (scrollHeight / pageHeight) * 100;
    if (scrolled > 80) {
        await loadMoreFiles();
    }
}, true); //true to capture event from child elements


async function getAppInfo() {
    res = await fetch('/data/info');
    res = await res.json();

    storageElement = document.getElementById("storage-used");
    totalFilesElement = document.getElementById("total-files");

    storageElement.textContent = `${((res['storage_used']/1024/1024).toFixed(2))}MB`;
    totalFilesElement.textContent = res['total_files'];
}


document.addEventListener("DOMContentLoaded", function() {
    getFileList();
    getAppInfo();
});