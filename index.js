import { selectEl, selectEls, loadTranslationLanguage, translate, dispatchInputEvents, removeFileExtension, UserError, getStackTrace, downloadBlob, sleep } from "./essential.js";
import * as HoloPrint from "./HoloPrint.js";

// Componentes Web (garantir que sejam importados para definição)
import "./components/FileInputTable.js";
import "./components/SimpleLogger.js";

// Módulos necessários para o preview de textura (serão usados em HoloPrint.js para o preview)
// import BlockGeoMaker from "./BlockGeoMaker.js"; // Indiretamente usado por HoloPrint.generateStructureTexturePreview
// import TextureAtlas from "./TextureAtlas.js";   // Indiretamente usado por HoloPrint.generateStructureTexturePreview
import ResourcePackStack from "./ResourcePackStack.js"; // Necessário para o contexto de texturas

const IN_PRODUCTION = false;
const ACTUAL_CONSOLE_LOG = false;
const HOLOLAB_APP_VERSION = "1.0.0-HoloLab";

// Variáveis globais para elementos da UI
let dropFileNotice;
let generatePackForm;
let generatePackFormSubmitButton;
let structureFilesInput;
let structureFilesTable;
let packNameInput; // Para o nome do pacote opcional
let completedPacksCont;
let errorLogContainer;
let logger; // Instância do SimpleLogger

let languageSelector;
let defaultResourcePackStackPromise;

let dropZoneStructure;
let texturePreviewImageCont; // O div que conterá a imagem ou o loader
let texturePreviewName;      // O <p> para o nome do arquivo
let texturePreviewLoader;    // O <div class="loader">

document.addEventListener("DOMContentLoaded", () => {
    // Inicialização de elementos da UI
    dropFileNotice = selectEl("#dropFileNotice");
    generatePackForm = selectEl("#generatePackForm");
    generatePackFormSubmitButton = selectEl("#generatePackButton");
    structureFilesInput = selectEl("#structureFilesInput");
    dropZoneStructure = selectEl("#dropZoneStructure");
    structureFilesTable = selectEl("#structureFilesTable");
    texturePreviewImageCont = selectEl("#texturePreviewImageCont");
    texturePreviewName = selectEl("#texturePreviewName");
    if (texturePreviewImageCont) {
        texturePreviewLoader = texturePreviewImageCont.querySelector(".loader");
    }
    
    packNameInput = generatePackForm.elements.namedItem("packName");
    completedPacksCont = selectEl("#completedPacksCont");
    errorLogContainer = selectEl("#errorLogContainer");

    if (!ACTUAL_CONSOLE_LOG) {
        if (errorLogContainer) {
            logger = document.createElement("simple-logger");
            errorLogContainer.innerHTML = ''; 
            errorLogContainer.appendChild(logger);
            logger.patchConsoleMethods();
        } else {
            console.warn("#errorLogContainer not found for SimpleLogger. Logging to console.");
            window.logger = console; // Fallback
        }
    } else {
        window.logger = console;
    }
    
    if (structureFilesTable && structureFilesInput) {
        structureFilesTable.fileInput = structureFilesInput;
        // FileInputTable deve ouvir 'input' em seu fileInput associado
    } else {
        logger?.warn("HTMLInputElement for structures or FileInputTable component not found.");
    }

	packNameInput?.addEventListener("invalid", () => {
		if (packNameInput) packNameInput.setCustomValidity(translateCurrentLanguage("metadata.pack_name.error") || "Pack name cannot contain '/'");
	});
	packNameInput?.addEventListener("input", () => {
		if (packNameInput) packNameInput.setCustomValidity("");
	});

    setupStructureFileHandling();

	structureFilesInput.addEventListener("input", () => {
        updatePackNameInputPlaceholder();
        updateTexturePreview(); // Atualizar preview
        // Notificar FileInputTable, caso ele não observe o input diretamente
        if (structureFilesTable) structureFilesTable.dispatchEvent(new CustomEvent('filesupdated'));
    });
    
    updatePackNameInputPlaceholder(); 
    updateTexturePreview(); 

	defaultResourcePackStackPromise = new ResourcePackStack();
	
	if(location.search == "?loadFile") { 
		window.launchQueue?.setConsumer(async launchParams => {
			if (launchParams.files && launchParams.files.length > 0) {
                const files = await Promise.all(launchParams.files.map(fileHandle => fileHandle.getFile()));
                handleDroppedFiles(files);
            }
		});
	}
	
	generatePackForm.addEventListener("submit", async (e) => {
		e.preventDefault();
		const filesToProcess = Array.from(structureFilesInput.files);
        if (filesToProcess.length === 0) {
            alert(translateCurrentLanguage("upload.error.no_file_selected") || "Please select a .mcstructure file.");
            return;
        }
		makePackAndHandleUI(filesToProcess, []);
	});
	
    languageSelector = selectEl("#languageSelector");
	setupLanguageSelector();
});

function setupStructureFileHandling() {
    if (!dropZoneStructure || !structureFilesInput) {
        logger?.warn("Drop zone or structure file input not found for setup.");
        return;
    }

    dropZoneStructure.addEventListener("click", () => structureFilesInput.click());

    const dragEvents = ["dragenter", "dragover", "dragleave", "drop"];
    dragEvents.forEach(eventName => {
        dropZoneStructure.addEventListener(eventName, preventDefaults, false);
        document.documentElement.addEventListener(eventName, preventDefaults, false); // Para drop global
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    let dragCounter = 0; // Contador para dragenter/dragleave no documentElement

    dropZoneStructure.addEventListener("dragenter", () => dropZoneStructure.classList.add("dragover"));
    dropZoneStructure.addEventListener("dragover", () => dropZoneStructure.classList.add("dragover"));
    dropZoneStructure.addEventListener("dragleave", () => dropZoneStructure.classList.remove("dragover"));
    dropZoneStructure.addEventListener("drop", (e) => {
        dropZoneStructure.classList.remove("dragover");
        showDropNotice(false); // Esconde o aviso global
        dragCounter = 0; // Reseta o contador global
        if (e.dataTransfer && e.dataTransfer.files.length) {
            const mcstructureFiles = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith(".mcstructure"));
            if (mcstructureFiles.length > 0) {
                const dt = new DataTransfer();
                mcstructureFiles.forEach(f => dt.items.add(f));
                structureFilesInput.files = dt.files;
                dispatchInputEvents(structureFilesInput);
            } else {
                alert(translateCurrentLanguage("upload.error.mcstructure_only") || "Please drop .mcstructure files only.");
            }
        }
    });

    document.documentElement.addEventListener("dragenter", (e) => {
        if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
            dragCounter++;
            showDropNotice(true);
        }
    });
    document.documentElement.addEventListener("dragleave", (e) => {
        // Verifica se o mouse realmente saiu da janela do navegador
        if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight || !document.documentElement.contains(e.relatedTarget as Node)) {
            dragCounter--;
            if (dragCounter <= 0) {
                showDropNotice(false);
                dragCounter = 0;
            }
        }
    });
     document.documentElement.addEventListener("drop", (e) => { // Drop fora da dropZone principal
        dragCounter = 0;
        showDropNotice(false);
    });
}

function showDropNotice(show) {
    if (dropFileNotice) {
        dropFileNotice.classList.toggle("hidden", !show);
    }
}

function handleDroppedFiles(files) { 
    const mcstructureFiles = files.filter(file => file.name.endsWith(".mcstructure"));
    if (mcstructureFiles.length > 0) {
        const dt = new DataTransfer();
        mcstructureFiles.forEach(f => dt.items.add(f));
        structureFilesInput.files = dt.files; 
        dispatchInputEvents(structureFilesInput);
    } else {
        logger?.warn("No .mcstructure files found in dropped items for PWA/general drop.");
    }
}

function updatePackNameInputPlaceholder() {
	if (packNameInput && structureFilesInput) {
        const files = Array.from(structureFilesInput.files);
        packNameInput.placeholder = HoloPrint.getDefaultPackName(files);
    }
}

async function updateTexturePreview() {
    const defaultText = translateCurrentLanguage("preview.no_file_selected") || "No file selected";
    if (texturePreviewLoader) texturePreviewLoader.classList.add("hidden");
    if (texturePreviewImageCont) { // Limpa conteúdo anterior, exceto nome e loader
        Array.from(texturePreviewImageCont.children).forEach(child => {
            if (child !== texturePreviewLoader && child !== texturePreviewName) {
                child.remove();
            }
        });
    }
    if (!texturePreviewName) { // Se texturePreviewName não existe, não faz nada
        return;
    }


    if (!structureFilesInput || structureFilesInput.files.length === 0) {
        texturePreviewName.textContent = defaultText;
        return;
    }

    const file = structureFilesInput.files[0];
    texturePreviewName.textContent = removeFileExtension(file.name);
    if (texturePreviewLoader) texturePreviewLoader.classList.remove("hidden");
    
    try {
        // Simulação da chamada à função que buscará a textura
        // Substitua por: const previewBlob = await HoloPrint.generateStructureTexturePreview(file, await defaultResourcePackStackPromise);
        console.info("Attempting to generate texture preview for: " + file.name);
        await sleep(1000); // Simula o tempo de processamento
        
        // ------ INÍCIO DO PLACEHOLDER PARA GERAÇÃO DE PREVIEW ------
        // Esta parte será substituída pela lógica real de geração de textura
        if(texturePreviewLoader) texturePreviewLoader.classList.add("hidden");
        const placeholderMsg = document.createElement("p");
        placeholderMsg.textContent = `Texture Preview for ${file.name} (Implementation Pending)`;
        placeholderMsg.style.color = "var(--secondary-text-color)";
        placeholderMsg.style.fontSize = "0.8em";
        if (texturePreviewImageCont) texturePreviewImageCont.appendChild(placeholderMsg);
        // ------ FIM DO PLACEHOLDER ------

        // Lógica real (exemplo conceitual, depende da implementação em HoloPrint.js):
        // const imageBlob = await HoloPrint.generateStructureTexturePreview(file, await defaultResourcePackStackPromise);
        // if (imageBlob) {
        //     const imageUrl = URL.createObjectURL(imageBlob);
        //     const img = document.createElement('img');
        //     img.src = imageUrl;
        //     img.style.cssText = "max-width: 100%; max-height: 100%; object-fit: contain; image-rendering: pixelated;";
        //     img.onload = () => URL.revokeObjectURL(imageUrl); // Revogar após o carregamento
        //     texturePreviewImageCont.appendChild(img);
        // } else {
        //     throw new Error("Preview blob was null or undefined.");
        // }

    } catch (error) {
        console.error("Error generating/displaying texture preview:", error);
        if(texturePreviewLoader) texturePreviewLoader.classList.add("hidden");
        texturePreviewName.textContent = translateCurrentLanguage("preview.error_loading") || "Error loading preview";
        const errorMsg = document.createElement("p");
        errorMsg.textContent = `Could not generate preview for ${file.name}.`;
        errorMsg.style.color = "var(--error-red)"; // Defina --error-red no seu CSS
        errorMsg.style.fontSize = "0.8em";
        if (texturePreviewImageCont) texturePreviewImageCont.appendChild(errorMsg);
    } finally {
        if(texturePreviewLoader) texturePreviewLoader.classList.add("hidden");
    }
}


async function setupLanguageSelector() {
    if (!languageSelector) {
        logger?.warn("Language selector element not found. Defaulting to English.");
        await translatePage("en_US");
        return;
    }

    try {
        const response = await fetch("translations/languages.json");
        if (!response.ok) throw new Error(`Failed to load languages.json: ${response.status}`);
        const languagesAndNames = await response.json();
        
        const sortedLanguages = Object.entries(languagesAndNames).sort((a, b) => a[1].localeCompare(b[1]));
        
        if (sortedLanguages.length === 0) {
            logger?.warn("No languages found in languages.json. Defaulting to English.");
            await translatePage("en_US");
            if (languageSelector.parentElement) languageSelector.parentElement.classList.add("hidden");
            return;
        }
        
        let browserLang = (navigator.language || navigator.userLanguage || "en_US").replace("-", "_");
        let defaultLanguage = sortedLanguages.find(([code]) => code.toLowerCase() === browserLang.toLowerCase())?.[0] ||
                              sortedLanguages.find(([code]) => code.split("_")[0].toLowerCase() === browserLang.split("_")[0].toLowerCase())?.[0] ||
                              sortedLanguages[0][0]; 

        languageSelector.innerHTML = ''; 
        sortedLanguages.forEach(([code, name]) => {
            const option = new Option(name, code);
            languageSelector.add(option);
        });
        
        languageSelector.value = defaultLanguage; 
        await translatePage(defaultLanguage); 

        languageSelector.addEventListener("change", async (event) => {
            await translatePage(event.target.value);
        });

    } catch (error) {
        logger?.error("Error setting up language selector:", error);
        await translatePage("en_US"); 
        if (languageSelector.parentElement) languageSelector.parentElement.classList.add("hidden");
    }
}

async function translatePage(languageCode) {
    try {
        await loadTranslationLanguage(languageCode); 
    } catch (e) {
        logger?.error(`Failed to load translation file for ${languageCode}:`, e);
        if (languageCode !== "en_US") { 
            logger?.warn("Falling back to English (en_US) translation for UI.");
            try {
                await loadTranslationLanguage("en_US");
                languageCode = "en_US"; 
            } catch (e2) {
                logger?.error("Failed to load English fallback translation:", e2);
                return; 
            }
        } else {
            return; 
        }
    }

    document.documentElement.lang = languageCode.split(/[-_]/)[0];

    const elements = document.querySelectorAll("[data-translate]");
    elements.forEach(element => {
        const key = element.dataset.translate;
        let translation = translate(key, languageCode); 
        
        if (translation === undefined && languageCode !== "en_US") {
            translation = translate(key, "en_US");
        }

        if (translation !== undefined) {
            let finalTranslation = translation;
            // Substituições de placeholders
            Object.keys(element.dataset).forEach(dataKey => {
                if (dataKey.startsWith("translationSub")) {
                    const placeholder = dataKey.substring("translationSub".length).toUpperCase();
                    finalTranslation = finalTranslation.replace(`{${placeholder}}`, element.dataset[dataKey]);
                }
            });
             // Substituição específica para {VERSION} se não houver dataset
            if (finalTranslation.includes("{VERSION}") && !element.dataset.translationSubVersion) {
                finalTranslation = finalTranslation.replace(/{VERSION}/g, HOLOLAB_APP_VERSION);
            }

            // Lógica de pluralização para {COUNT}
            if (element.dataset.translationSubCount) {
                const count = parseInt(element.dataset.translationSubCount);
                if (!isNaN(count)) {
                    if (count > 1) {
                        finalTranslation = finalTranslation.replace(/\[s\]/g, 's').replace(/\[es\]/g, 'es');
                    } else {
                        finalTranslation = finalTranslation.replace(/\[s\]/g, '').replace(/\[es\]/g, '');
                    }
                }
                finalTranslation = finalTranslation.replace(/\[|\]/g, ''); // Remove colchetes restantes
            }
            
            // Determinar onde aplicar a tradução
            let appliedToAttribute = false;
            for (const attr of Object.keys(element.dataset)) {
                if (attr.startsWith("translate") && attr !== "translate" && !attr.startsWith("translationSub")) {
                    const targetAttribute = attr.substring('translate'.length).toLowerCase();
                     if (['placeholder', 'title', 'value', 'alt', 'aria-label'].includes(targetAttribute)) {
                        element[targetAttribute] = finalTranslation;
                        appliedToAttribute = true;
                        break; 
                    } else if (targetAttribute) {
                        element.setAttribute(targetAttribute, finalTranslation);
                        appliedToAttribute = true;
                        break;
                    }
                }
            }
            if (!appliedToAttribute) {
                element.innerHTML = finalTranslation; 
            }

        } else {
            // logger?.warn(`Missing translation for key "${key}" (lang: ${languageCode}).`);
        }
    });
}


function translateCurrentLanguage(translationKey) {
	if(!languageSelector) {
		const fallbackTranslation = translate(translationKey, "en_US");
        return fallbackTranslation === undefined ? translationKey : fallbackTranslation;
	}
	let currentLang = languageSelector.value;
	let translation = translate(translationKey, currentLang);

	if(translation === undefined && currentLang !== "en_US") {
		translation = translate(key, "en_US"); 
		if(translation === undefined) {
			return translationKey; 
		}
	} else if (translation === undefined) {
        return translationKey;
    }
	return translation;
}


async function makePackAndHandleUI(files, localResourcePacks) {
	if (!generatePackFormSubmitButton || !completedPacksCont) {
        logger?.error("UI elements for pack generation not found.");
        return;
    }
    generatePackFormSubmitButton.disabled = true;
	
	let formData = new FormData(generatePackForm);
    let authors = [];
    const authorField = formData.get("author"); // Assumindo que existe um input com name="author"
    if (typeof authorField === 'string') {
        authors = authorField.split(",").map(x => x.trim()).filter(Boolean);
    }
	
	/** @type {import("./HoloPrint.js").HoloPrintConfig} */
	let config = {
		IGNORED_BLOCKS: formData.get("ignoredBlocks")?.toString().split(/\W/).filter(Boolean) ?? HoloPrint.IGNORED_BLOCKS,
		SCALE: formData.get("scale") ? parseFloat(formData.get("scale").toString()) / 100 : 0.95,
		TINT_COLOR: formData.get("tintColor")?.toString() || "#579EFA",
		TINT_OPACITY: formData.get("tintOpacity") ? parseFloat(formData.get("tintOpacity").toString()) / 100 : 0.2,
        TEXTURE_OUTLINE_WIDTH: formData.get("textureOutlineWidth") ? parseFloat(formData.get("textureOutlineWidth").toString()) : 0.25,
        TEXTURE_OUTLINE_COLOR: formData.get("textureOutlineColor")?.toString() || "#0000FF",
        TEXTURE_OUTLINE_OPACITY: formData.get("textureOutlineOpacity") ? parseFloat(formData.get("textureOutlineOpacity").toString()) / 100 : 0.65,
		SPAWN_ANIMATION_ENABLED: !!formData.get("spawnAnimationEnabled"),
		PLAYER_CONTROLS_ENABLED: !!formData.get("playerControlsEnabled"),
		MATERIAL_LIST_ENABLED: !!formData.get("materialListEnabled"),
        OPACITY: 0.9, 
        MULTIPLE_OPACITIES: true, 
        MINI_SCALE: 0.125, 
        SPAWN_ANIMATION_LENGTH: 0.4, 
        RETEXTURE_CONTROL_ITEMS: false, 
        CONTROL_ITEM_TEXTURE_SCALE: 1, 
        RENAME_CONTROL_ITEMS: true, 
        WRONG_BLOCK_OVERLAY_COLOR: [1, 0, 0, 0.3], 
        INITIAL_OFFSET: [
            formData.get("initialOffsetX") ? parseInt(formData.get("initialOffsetX").toString()) : 0,
            formData.get("initialOffsetY") ? parseInt(formData.get("initialOffsetY").toString()) : 0,
            formData.get("initialOffsetZ") ? parseInt(formData.get("initialOffsetZ").toString()) : 0
        ],
        BACKUP_SLOT_COUNT: 10, 
		PACK_NAME: formData.get("packName")?.toString() || undefined,
		PACK_ICON_BLOB: undefined, 
		AUTHORS: authors,
		DESCRIPTION: undefined, 
		COMPRESSION_LEVEL: 5, 
        PREVIEW_BLOCK_LIMIT: 0, 
        SHOW_PREVIEW_SKYBOX: false, 
        CONTROLS: HoloPrint.DEFAULT_PLAYER_CONTROLS, 
        IGNORED_MATERIAL_LIST_BLOCKS: [] 
	};
	
    completedPacksCont.innerHTML = '';

	let infoButton = document.createElement("button");
	infoButton.classList.add("packInfoButton"); 
	infoButton.dataset.translate = "progress.generating";
    completedPacksCont.prepend(infoButton);
    await translatePage(languageSelector.value); 
	
	let resourcePackStack = await defaultResourcePackStackPromise;
    if (localResourcePacks && localResourcePacks.length > 0) { 
        resourcePackStack = await new ResourcePackStack(localResourcePacks);
    }
	
	let pack;
	logger?.setOriginTime(performance.now());
	
	let generationFailedError;
	if(ACTUAL_CONSOLE_LOG) {
		pack = await HoloPrint.makePack(files, config, resourcePackStack, null);
	} else {
		try {
			pack = await HoloPrint.makePack(files, config, resourcePackStack, null);
		} catch(e) {
			logger?.error(`Pack creation failed!\n${e.stack || e}`);
			if(!(e instanceof UserError)) {
				generationFailedError = e;
			}
			if(!(e instanceof DOMException)) { 
				logger?.debug(getStackTrace(e).join("\n"));
			}
		}
	}
	
	infoButton.classList.add("finished");
	if(pack) {
		infoButton.dataset.translate = "button.download_pack"; 
		infoButton.classList.add("completed");
		infoButton.onclick = () => {
			downloadBlob(pack, pack.name);
		};
	} else {
		if(generationFailedError) {
			let bugReportAnchor = document.createElement("a");
			bugReportAnchor.classList.add("buttonlike", "packInfoButton", "reportIssue");
			bugReportAnchor.href = `https://github.com/Holo-Lab/holo/issues/new?template=1-pack-creation-error.yml&title=Pack creation error: ${encodeURIComponent(generationFailedError.toString().replaceAll("\n", " "))}&version=${HoloPrint.VERSION}&logs=${encodeURIComponent(logger?.allLogs ? JSON.stringify(logger.allLogs) : "[]")}`;
			bugReportAnchor.target = "_blank";
			bugReportAnchor.dataset.translate = "pack_generation_failed.report_github_issue";
			infoButton.parentNode.replaceChild(bugReportAnchor, infoButton);
		} else {
			infoButton.classList.add("failed");
			infoButton.dataset.translate = "pack_generation_failed";
		}
	}
    await translatePage(languageSelector.value);
	generatePackFormSubmitButton.disabled = false;
}
