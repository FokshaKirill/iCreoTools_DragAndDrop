let socket;
let originalImage; // Для хранения исходного изображения
let zipData; // Для хранения данных ZIP

window.initSocketHandler = function () {
    socket = new WebSocket("wss://a33336-ee73.s.d-f.pw/connect");

    socket.onopen = () => console.log("WebSocket открыт");
    socket.onerror = (error) => {
        console.error("Ошибка WebSocket:", error);
        alert("Ошибка WebSocket. Проверьте консоль.");
    };
    socket.onclose = (event) => {
        console.log("WebSocket закрыт. Код:", event.code, "Причина:", event.reason, "Чистое закрытие:", event.wasClean);
    };
    socket.onmessage = handleMessage;

    document.getElementById("uploadForm").addEventListener("submit", async (e) => {
        e.preventDefault();

        const fileInput = document.getElementById("fileInput");
        const file = fileInput.files[0];
        if (!file) return alert("Выберите PNG-файл");

        if (file.size > 1024 * 1024) {
            return alert("Файл слишком большой. Выберите файл меньше 1 МБ.");
        }

        console.log("Отправка данных на сервер... Размер файла:", file.size / 1024, "КБ");

        originalImage = await loadImage(file);
        const base64 = await fileToBase64(file);
        console.log("Base64 (первые 50 символов):", base64.substring(0, 50));

        const request = {
            Image: base64,
            Configuration: { AlphaLimit: 0, CheckSum: 0, CutterStep: 5 }
        };

        if (socket.readyState === WebSocket.OPEN) {
            try {
                console.log("Отправка данных, размер JSON:", JSON.stringify(request).length / 1024, "КБ");
                socket.send(JSON.stringify(request));
            } catch (error) {
                console.error("Ошибка при отправке данных:", error);
                alert("Не удалось отправить данные на сервер.");
            }
        } else {
            console.error("WebSocket не открыт.");
            alert("WebSocket не подключен.");
        }
    });

    // Обработчик кнопки скачивания
    const downloadBtn = document.getElementById("download-btn");
    if (downloadBtn) {
        downloadBtn.addEventListener("click", () => {
            console.log("Клик по кнопке Download ZIP");
            if (zipData) {
                const downloadStatus = document.getElementById("download-status");
                downloadStatus.textContent = "Скачивание началось...";
                downloadStatus.style.display = "block";

                const url = URL.createObjectURL(zipData);
                const a = document.createElement("a");
                a.href = url;
                a.download = "result.zip";
                a.click();
                URL.revokeObjectURL(url);

                // Сбрасываем интерфейс после скачивания
                setTimeout(() => {
                    document.getElementById("preview-container").style.display = "none";
                    document.getElementById("progress-bar").style.width = "0%";
                    downloadBtn.style.display = "none";
                    downloadStatus.style.display = "none";
                }, 1000);
            } else {
                console.error("ZIP-архив не готов.");
                alert("ZIP-архив не готов. Попробуйте снова.");
            }
        });
    } else {
        console.error("Кнопка Download ZIP не найдена.");
    }
};

function handleMessage(event) {
    let message;
    try {
        message = JSON.parse(event.data);
    } catch (error) {
        console.error("Ошибка парсинга сообщения:", error, "Данные:", event.data);
        return;
    }

    const progressBar = document.getElementById("progress-bar");
    const downloadBtn = document.getElementById("download-btn");

    if (message.type === "progress") {
        progressBar.style.width = `${message.value}%`;
        console.log(`Прогресс: ${message.value}%`);
        // Показываем кнопку при 99%+
        if (message.value >= 99) {
            downloadBtn.style.display = "block";
        }
    } else if (message.type === "result") {
        progressBar.style.width = "100%";
        console.log("Получен результат:", message.data);
        createZipFromResult(message.data);
        downloadBtn.style.display = "block"; // Убедимся, что кнопка видна
    } else if (message.type === "error") {
        console.error("Ошибка от сервера:", message.data);
        alert(`Ошибка на сервере: ${message.data}`);
        progressBar.style.width = "0%";
        downloadBtn.style.display = "none";
    } else {
        console.warn("Неизвестный тип сообщения:", message);
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
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

function cropImage(image, x, y, width, height) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob);
        }, "image/png");
    });
}

function drawPreview(image, data) {
    const canvas = document.getElementById("preview-canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = image.width;
    canvas.height = image.height;

    ctx.drawImage(image, 0, 0);

    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    data.forEach((item) => {
        const { X, Y, Width, Height } = item;
        if (X && Y && Width && Height) {
            ctx.strokeRect(X, Y, Width, Height);
        }
    });

    document.getElementById("preview-container").style.display = "block";
}

async function createZipFromResult(data) {
    const zip = new JSZip();

    if (!Array.isArray(data)) {
        console.error("Ожидался массив данных, получено:", data);
        alert("Ошибка: сервер отправил некорректные данные.");
        return;
    }

    if (!originalImage) {
        console.error("Исходное изображение не загружено.");
        alert("Ошибка: исходное изображение недоступно.");
        return;
    }

    // Рисуем предпросмотр
    drawPreview(originalImage, data);

    // Создаем ZIP
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (!item || typeof item !== "object") {
            console.error(`Некорректный формат данных для элемента ${i}:`, item);
            continue;
        }

        const { X, Y, Width, Height } = item;
        if (!X || !Y || !Width || !Height) {
            console.error(`Отсутствуют координаты или размеры для элемента ${i}:`, item);
            continue;
        }

        try {
            const imgBlob = await cropImage(originalImage, X, Y, Width, Height);
            zip.file(`cut_${i + 1}.png`, imgBlob);
        } catch (error) {
            console.error(`Ошибка при обрезке изображения ${i + 1}:`, error);
        }
    }

    try {
        zipData = await zip.generateAsync({ type: "blob" });
        console.log("ZIP успешно создан, размер:", zipData.size / 1024, "КБ");
    } catch (error) {
        console.error("Ошибка при создании ZIP:", error);
        alert("Не удалось создать ZIP-архив.");
        zipData = null;
    }
}