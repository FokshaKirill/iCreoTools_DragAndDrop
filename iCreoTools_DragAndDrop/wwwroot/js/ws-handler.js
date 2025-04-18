let socket;
let originalImages = [];
let processedResults = [];

window.initSocketHandler = function () {
    socket = new WebSocket("wss://a33336-ee73.s.d-f.pw/connect");
    const wsUrl = `${socket.url.replace('ws', 'http').replace('connect', '')}/temp/cutter/`;

    socket.onopen = () => console.log("WebSocket открыт");
    socket.onerror = (error) => {
        console.error("Ошибка WebSocket:", error);
        alert("Ошибка WebSocket. Проверьте консоль.");
    };
    socket.onclose = (event) => {
        console.log("WebSocket закрыт. Код:", event.code, "Причина:", event.reason, "Чистое закрытие:", event.wasClean);
    };

    let currentProcessingIndex = null;
    let resolveMap = new Map();

    socket.onmessage = (event) => {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch (error) {
            console.error("Ошибка парсинга сообщения:", error, "Данные:", event.data);
            return;
        }

        if (currentProcessingIndex === null) {
            console.warn("Получено сообщение, но нет активного запроса:", message);
            return;
        }

        const { resolve, reject } = resolveMap.get(currentProcessingIndex) || {};

        if (!resolve || !reject) {
            console.warn("Не найдены промисы для текущего индекса:", currentProcessingIndex);
            return;
        }

        if (message.type === "progress") {
            const progressBar = document.getElementById(`progress-bar-${currentProcessingIndex}`);
            if (progressBar) {
                progressBar.style.width = `${message.value}%`;
                progressBar.textContent = `${Math.round(message.value)}%`;
                progressBar.setAttribute("aria-valuenow", message.value);
                console.log(`Прогресс для изображения ${currentProcessingIndex}: ${message.value}%`);
            }
        } else if (message.type === "result") {
            const progressBar = document.getElementById(`progress-bar-${currentProcessingIndex}`);
            if (progressBar) {
                progressBar.style.width = "100%";
                progressBar.textContent = "100%";
                progressBar.setAttribute("aria-valuenow", 100);
                progressBar.parentElement.style.display = "none";
            }

            const imageElement = document.getElementById(`image-${currentProcessingIndex}`);
            if (imageElement) {
                imageElement.style.opacity = "0";
                setTimeout(() => {
                    const newSrc = `${wsUrl}${message.previewUrl.split('/').slice(-1)}`;
                    console.log(`Обновление src для image-${currentProcessingIndex}: ${newSrc}`);
                    imageElement.src = newSrc;
                    imageElement.style.opacity = "1";
                }, 300);
            }

            resolve({ response: message, index: currentProcessingIndex });
            resolveMap.delete(currentProcessingIndex);
        } else if (message.type === "error") {
            console.error(`Ошибка для изображения ${currentProcessingIndex}:`, message.data);
            alert(`Ошибка на сервере для изображения ${currentProcessingIndex}: ${message.data}`);
            reject(new Error(message.data));
            resolveMap.delete(currentProcessingIndex);
        } else {
            console.warn("Неизвестный тип сообщения:", message);
        }
    };

    function createImageCard(imgData, index) {
        const previewImages = document.getElementById("preview-images");
        const card = document.createElement("div");
        card.className = "col-md-4 mb-3";
        card.id = `image-card-${index}`;
        card.innerHTML = `
            <div class="card image-card">
                <div class="card-overlay"></div>
                <img id="image-${index}" src="${imgData.image.src}" class="card-img-top image-fade" alt="${imgData.name}">
                <div class="progress">
                    <div class="progress-bar" role="progressbar" style="width: 0%;" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" id="progress-bar-${index}">0%</div>
                </div>
                <div class="overlay-imgs">
                    <img src="./images/eye.png" id="eye-btn-${index}" class="eye-btn" style="display: none;">
                    <img src="./images/dwnd-img.png" id="download-btn-${index}" class="download-btn" style="display: none;">
                </div>
            </div>
        `;
        previewImages.appendChild(card);
    }

    function createAddMoreCard() {
        const previewImages = document.getElementById("preview-images");
        const card = document.createElement("div");
        card.className = "col-md-4 mb-3";
        card.id = "add-more-card";
        card.innerHTML = `
            <div class="card image-card add-more-card">
                <div class="card-overlay"></div>
                <img src="./images/png-icon.svg" id="add-more-img" class="card-img-top" alt="Add More">
                <div class="add-more-text">Add More</div>
            </div>
        `;
        previewImages.appendChild(card);

        card.addEventListener("click", () => {
            const fileInput = document.getElementById("fileInput");
            fileInput.click();
        });
    }

    function removeModalBackdrop() {
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(backdrop => {
            console.log('Удаление modal-backdrop');
            backdrop.remove();
        });
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('padding-right');
    }

    const sendRequest = (request, index) => {
        return new Promise((resolve, reject) => {
            currentProcessingIndex = index;
            resolveMap.set(index, { resolve, reject });

            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(request));
            } else {
                console.error("WebSocket не открыт.");
                alert("WebSocket не подключен.");
                reject(new Error("WebSocket не подключен."));
                resolveMap.delete(index);
                currentProcessingIndex = null;
            }
        });
    };

    async function processQueue(queue) {
        while (queue.length > 0) {
            const { imgData, request, index } = queue.shift();
            console.log(`Обработка изображения ${index}: ${imgData.name}`);

            try {
                const { response, index: responseIndex } = await sendRequest(request, index);
                if (response.type === "result") {
                    processedResults[responseIndex] = {
                        previewUrl: response.previewUrl,
                        zipUrl: response.zipUrl
                    };

                    const downloadBtn = document.getElementById(`download-btn-${responseIndex}`);
                    if (downloadBtn) {
                        downloadBtn.style.display = "block";
                        downloadBtn.addEventListener("click", () => {
                            const zipUrl = processedResults[responseIndex].zipUrl;
                            if (zipUrl) {
                                const a = document.createElement("a");
                                const zipSrc = `${wsUrl}${zipUrl.split('/').slice(-1)}`;
                                console.log(`Скачивание ZIP: ${zipSrc}`);
                                a.href = zipSrc;
                                a.download = `result_${responseIndex + 1}.zip`;
                                a.click();
                            } else {
                                alert("ZIP-архив для этого изображения не доступен.");
                            }
                        });
                    } else {
                        console.error(`Кнопка download-btn-${responseIndex} не найдена`);
                    }

                    const eyeBtn = document.getElementById(`eye-btn-${responseIndex}`);
                    if (eyeBtn) {
                        eyeBtn.style.display = "block";
                        eyeBtn.addEventListener("click", () => {
                            console.log(`Клик на eye-btn-${responseIndex}`);
                            const previewImage = document.getElementById("preview-image");
                            const previewModal = document.getElementById("imagePreviewModal");
                            if (!previewImage || !previewModal) {
                                console.error("Не найдены элементы preview-image или imagePreviewModal");
                                alert("Ошибка: Не удалось открыть предпросмотр. Проверьте консоль.");
                                return;
                            }
                            const imageSrc = `${wsUrl}${processedResults[responseIndex].previewUrl.split('/').slice(-1)}`;
                            console.log(`Установка preview-image src: ${imageSrc}`);
                            previewImage.src = imageSrc;
                            const modal = new bootstrap.Modal(previewModal, { keyboard: true });
                            modal.show();
                            previewModal.addEventListener('hidden.bs.modal', removeModalBackdrop, { once: true });
                        });
                    } else {
                        console.error(`Кнопка eye-btn-${responseIndex} не найдена`);
                    }
                }
            } catch (error) {
                console.error(`Не удалось обработать изображение ${imgData.name}:`, error);
                alert(`Не удалось обработать изображение ${imgData.name}. Продолжаем с остальными...`);
            }
        }

        if (processedResults.length === 0) {
            alert("Не удалось обработать ни одно изображение.");
            const previewModal = bootstrap.Modal.getInstance(document.getElementById('previewModal'));
            if (previewModal) {
                previewModal.hide();
                removeModalBackdrop();
            }
        } else {
            createAddMoreCard();
        }
    }

    document.getElementById("uploadForm").addEventListener("submit", async (e) => {
        e.preventDefault();

        const fileInput = document.getElementById("fileInput");
        const files = fileInput.files;
        if (!files || files.length === 0) return alert("Выберите один или несколько PNG-файлов");

        originalImages = [];
        processedResults = [];
        const previewImages = document.getElementById("preview-images");
        previewImages.innerHTML = "";
        resolveMap.clear();
        currentProcessingIndex = null;

        const loadPromises = Array.from(files).map(async (file, index) => {
            if (file.size > 5120 * 5120) {
                alert(`Файл ${file.name} слишком большой. Выберите файл меньше 5 МБ.`);
                return null;
            }

            console.log(`Загрузка ${file.name}... Размер файла:`, file.size / 1024, "КБ");

            const image = await loadImage(file);
            return { image, file, name: file.name, index };
        });

        const loadedImages = (await Promise.all(loadPromises)).filter(img => img !== null);
        originalImages = loadedImages;

        if (originalImages.length === 0) {
            alert("Нет подходящих файлов для обработки.");
            return;
        }

        originalImages.forEach((imgData, index) => {
            createImageCard(imgData, index);
        });

        const previewModal = new bootstrap.Modal(document.getElementById('previewModal'), {
            keyboard: true
        });
        previewModal.show();
        document.getElementById('previewModal').addEventListener('hidden.bs.modal', removeModalBackdrop, { once: true });

        const queue = [];
        for (const imgData of originalImages) {
            const base64 = await fileToBase64(imgData.file);
            console.log(`Base64 для ${imgData.name} (первые 50 символов):`, base64.substring(0, 50));

            const request = {
                Image: base64,
                Configuration: { AlphaLimit: 0, CheckSum: 0, CutterStep: 5 }
            };

            queue.push({ imgData, request, index: imgData.index });
        }

        processQueue(queue);
    });

    const addMoreBtn = document.getElementById("add-more-btn");
    if (addMoreBtn) {
        addMoreBtn.addEventListener("click", () => {
            const fileInput = document.getElementById("fileInput");
            fileInput.click();
        });
    }

    document.getElementById("fileInput").addEventListener("change", async (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            document.getElementById("uploadForm").dispatchEvent(new Event("submit"));
        }
    });
};

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(reader.result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}