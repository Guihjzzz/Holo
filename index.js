import { selectEl, selectEls, loadTranslationLanguage, translate, UserError } from "./essential.js";
// Não vamos importar módulos de geração de pacote HoloPrint por enquanto,
// pois a funcionalidade principal agora é texturização.
// Os módulos como TextureAtlas.js serão importados quando implementarmos a geração de textura.

let dropFileNotice;
let languageSelector;
let imageFilesInput;
let dropZone;
let filePreviewArea;
let generateTexturesButton;

// Placeholder para a versão, que pode vir de uma constante ou ser definida aqui
const HOLOLAB_APP_VERSION = "1.0.0-HoloLab"; // Você pode ajustar isso

document.addEventListener("DOMContentLoaded", () => {
    // Inicialização de elementos da UI
    dropFileNotice = selectEl("#dropFileNotice");
    languageSelector = selectEl("#languageSelector");
    imageFilesInput = selectEl("#imageFilesInput");
    dropZone = selectEl("#dropZone");
    filePreviewArea = selectEl("#file-preview-area");
    generateTexturesButton = selectEl("#generateTexturesButton");

    // Lógica de Drag and Drop
    setupDragAndDrop();

    // Lógica do seletor de idiomas
    setupLanguageSelector();

    // Evento para o botão de gerar texturas (placeholder por enquanto)
    if (generateTexturesButton) {
        generateTexturesButton.addEventListener("click", () => {
            alert("Texture generation logic to be implemented!");
            // Aqui chamaremos a função principal de processamento de texturas no futuro
        });
    }
});

function setupDragAndDrop() {
    if (!dropZone || !imageFilesInput) return;

    dropZone.addEventListener("click", () => imageFilesInput.click());

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
        showDropNotice(true);
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
        // Não esconder o aviso aqui, apenas no drop ou cancelamento global
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        showDropNotice(false);
        if (e.dataTransfer.files.length) {
            imageFilesInput.files = e.dataTransfer.files;
            handleFileSelection();
        }
    });

    imageFilesInput.addEventListener("change", handleFileSelection);

    // Eventos globais para mostrar/esconder o aviso de drop
    let dragCounter = 0;
    document.documentElement.addEventListener("dragenter", (e) => {
        if (e.dataTransfer.types.includes("Files")) {
            dragCounter++;
            showDropNotice(true);
        }
    });
    document.documentElement.addEventListener("dragleave", (e) => {
        // Verificar se o mouse realmente saiu da janela
        if (e.clientX === 0 && e.clientY === 0 && e.pageX === 0 && e.pageY === 0) {
             // Heurística para detectar saída da janela, não é 100%
        } else if (!document.documentElement.contains(e.relatedTarget)) {
            dragCounter--;
             if (dragCounter === 0) {
                showDropNotice(false);
            }
        }
    });
    document.documentElement.addEventListener("dragover", e => {
        if (e.dataTransfer.types.includes("Files")) {
             e.preventDefault(); // Necessário para permitir o drop
             showDropNotice(true); // Garante que o aviso apareça se o dragover for direto no document
        }
    });
    document.documentElement.addEventListener("drop", (e) => { // Drop fora da dropZone
        e.preventDefault();
        dragCounter = 0;
        showDropNotice(false);
    });
}

function showDropNotice(show) {
    if (dropFileNotice) {
        dropFileNotice.classList.toggle("hidden", !show);
    }
}


function handleFileSelection() {
    if (!filePreviewArea || !imageFilesInput.files.length) return;
    filePreviewArea.innerHTML = ''; // Limpa previews anteriores

    Array.from(imageFilesInput.files).forEach(file => {
        if (!file.type.startsWith('image/')) {
            console.warn(`File ${file.name} is not an image.`);
            // Adicionar feedback visual para o usuário aqui, se desejar
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const imgContainer = document.createElement('div');
            imgContainer.style.cssText = "width: 80px; height: 80px; margin: 5px; border: 1px solid var(--border-color); display: inline-flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 4px;";
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.cssText = "max-width: 100%; max-height: 100%; object-fit: contain;";
            imgContainer.appendChild(img);
            filePreviewArea.appendChild(imgContainer);
        }
        reader.readAsDataURL(file);
    });
}


async function setupLanguageSelector() {
    if (!languageSelector) return;

    try {
        const response = await fetch("translations/languages.json");
        if (!response.ok) throw new Error(`Failed to load languages.json: ${response.status}`);
        const languagesAndNames = await response.json();
        
        const sortedLanguages = Object.entries(languagesAndNames).sort((a, b) => a[1].localeCompare(b[1]));
        
        if (sortedLanguages.length <= 1) {
            languageSelector.parentElement.classList.add("hidden"); // Esconde o seletor se só tiver 1 idioma
            await translatePage(sortedLanguages[0]?.[0] || "en_US"); // Traduz para o único idioma ou fallback
            return;
        }

        let browserLang = navigator.language || navigator.userLanguage || "en_US"; // ex: "en-US" ou "pt-BR"
        let defaultLanguage = sortedLanguages.find(([code]) => code.replace("_", "-").toLowerCase() === browserLang.toLowerCase())?.[0] ||
                              sortedLanguages.find(([code]) => code.split(/[-_]/)[0].toLowerCase() === browserLang.split(/[-_]/)[0].toLowerCase())?.[0] ||
                              "en_US";

        languageSelector.innerHTML = ''; // Limpa opções existentes (como a do HTML)
        sortedLanguages.forEach(([code, name]) => {
            const option = new Option(name, code);
            languageSelector.add(option);
        });
        
        languageSelector.value = defaultLanguage; // Define o idioma padrão
        await translatePage(defaultLanguage); // Traduz a página inicialmente

        languageSelector.addEventListener("change", async (event) => {
            await translatePage(event.target.value);
        });

    } catch (error) {
        console.error("Error setting up language selector:", error);
        // Fallback para inglês se houver erro ao carregar os idiomas
        await translatePage("en_US");
        if (languageSelector.parentElement) languageSelector.parentElement.classList.add("hidden");
    }
}

async function translatePage(languageCode) {
    await loadTranslationLanguage(languageCode); // Função de essential.js

    const elements = document.querySelectorAll("[data-translate]");
    elements.forEach(element => {
        const key = element.dataset.translate;
        const translation = translate(key, languageCode); // Função de essential.js
        if (translation !== undefined) {
            // Lidar com substituições de placeholders como {AUTHOR} ou {VERSION}
            let finalTranslation = translation;
            if (element.dataset.translationSubAuthor) {
                finalTranslation = finalTranslation.replace("{AUTHOR}", element.dataset.translationSubAuthor);
            }
            if (element.dataset.translationSubVersion) {
                finalTranslation = finalTranslation.replace("{VERSION}", element.dataset.translationSubVersion || HOLOLAB_APP_VERSION);
            }
            // Adicionar mais substituições se necessário

            // Se o atributo for para um placeholder de input, por exemplo
            if (element.hasAttribute('data-translate-placeholder')) {
                 element.placeholder = finalTranslation;
            } else if (element.hasAttribute('data-translate-title')) {
                 element.title = finalTranslation;
            } else {
                element.innerHTML = finalTranslation; // Cuidado com XSS se as traduções não forem confiáveis
            }
        } else {
            console.warn(`Missing translation for key "${key}" in language "${languageCode}".`);
        }
    });
     // Traduzir atributos específicos, se houver
    const attrElements = document.querySelectorAll("[data-translate-attr]");
    attrElements.forEach(element => {
        const attrToTranslate = element.dataset.translateAttr; // ex: "title"
        const key = element.dataset.translateAttrKey || element.dataset.translate; // Pega a chave específica ou a geral
        const translation = translate(key, languageCode);
        if (translation !== undefined && attrToTranslate) {
            element.setAttribute(attrToTranslate, translation);
        } else if (attrToTranslate){
            console.warn(`Missing translation for attribute key "${key}" (for attribute "${attrToTranslate}") in language "${languageCode}".`);
        }
    });

    // Atualizar o atributo lang da tag html
    document.documentElement.lang = languageCode.split("_")[0];
}
