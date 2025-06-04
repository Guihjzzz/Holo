import { selectEl, selectEls, loadTranslationLanguage, translate, dispatchInputEvents, removeFileExtension, UserError, getStackTrace, downloadBlob } from "./essential.js";
import * as HoloPrint from "./HoloPrint.js"; // Funcionalidade principal de geração do pacote

// Importar componentes Web se eles forem usados diretamente no HTML e não apenas pelo HoloPrint.js
import "./components/FileInputTable.js"; // Garante que o custom element seja definido
import "./components/SimpleLogger.js";   // Garante que o custom element seja definido

const IN_PRODUCTION = false;
const ACTUAL_CONSOLE_LOG = false; // Defina como true para logs diretos no console do navegador
const HOLOLAB_APP_VERSION = "1.0.0-HoloLab"; // Pode ser dinâmico no futuro

// Variáveis globais para elementos da UI
let dropFileNotice;
let generatePackForm;
let generatePackFormSubmitButton;
let structureFilesInput; // O <input type="file"> real
let structureFilesTable; // O componente <file-input-table>
let packNameInput;
let completedPacksCont;
let errorLogContainer; // Onde o SimpleLogger será inserido
let logger; // Instância do SimpleLogger

let languageSelector;
let defaultResourcePackStackPromise;

let dropZoneStructure;
let texturePreviewImageCont;
let texturePreviewName;
let texturePreviewLoader;

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

    // Configurar o logger
    if (!ACTUAL_CONSOLE_LOG) {
        if (errorLogContainer) {
            logger = document.createElement("simple-logger");
            errorLogContainer.innerHTML = ''; // Limpar texto placeholder
            errorLogContainer.appendChild(logger);
            logger.patchConsoleMethods();
        } else {
            console.warn("#errorLogContainer not found for SimpleLogger.");
        }
    } else { // Se ACTUAL_CONSOLE_LOG for true, use o console padrão
        window.logger = console; // Para compatibilidade com chamadas logger?.
    }

    // Associar o input de arquivo ao componente file-input-table
    if (structureFilesTable && structureFilesInput) {
        structureFilesTable.fileInput = structureFilesInput; // Importante para o componente funcionar
        // O componente FileInputTable já deve ter um listener interno para o 'input' do seu fileInput
    } else {
        console.warn("HTMLInputElement for structures or FileInputTable component not found.");
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
        updateTexturePreview(); // Atualizar preview ao selecionar/remover arquivos
        // O FileInputTable deve se atualizar automaticamente se o fileInput associado mudar
    });
    
    // Chamadas iniciais
    updatePackNameInputPlaceholder(); 
    updateTexturePreview(); 

	defaultResourcePackStackPromise = new ResourcePackStack(); // Inicializa o stack padrão
	
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
        console.warn("Drop zone or structure file input not found for setup.");
        return;
    }

    dropZoneStructure.addEventListener("click", () => structureFilesInput.click());

    dropZoneStructure.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZoneStructure.classList.add("dragover");
    });

    dropZoneStructure.addEventListener("dragleave", () => {
        dropZoneStructure.classList.remove("dragover");
    });

    dropZoneStructure.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZoneStructure.classList.remove("dragover");
        showDropNotice(false);
        if (e.dataTransfer && e.dataTransfer.files.length) {
            const mcstructureFiles = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith(".mcstructure"));
            if (mcstructureFiles.length > 0) {
                const dt = new DataTransfer();
                mcstructureFiles.forEach(f => dt.items.add(f));
                structureFilesInput.files = dt.files;
                dispatchInputEvents(structureFilesInput); // ESSENCIAL para notificar outros listeners (como FileInputTable)
            } else {
                alert(translateCurrentLanguage("upload.error.mcstructure_only") || "Please drop .mcstructure files only.");
            }
        }
    });

    // Eventos globais para mostrar/esconder o aviso de drop
    let dragCounter = 0;
	document.documentElement.addEventListener("dragenter", (e) => {
        if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
            dragCounter++;
            showDropNotice(true);
        }
    });
	document.documentElement.addEventListener("dragleave", (e) => {
        // Verifica se o mouse realmente saiu da janela do navegador
        if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
            dragCounter--;
            if (dragCounter <= 0) { // Usar <= 0 para mais robustez
                showDropNotice(false);
                dragCounter = 0; // Resetar contador
            }
        }
    });
    document.documentElement.addEventListener("dragover", e => {
        if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
             e.preventDefault(); 
             showDropNotice(true); 
        }
    });
    document.documentElement.addEventListener("drop", (e) => { 
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

function handleDroppedFiles(files) { 
    const mcstructureFiles = files.filter(file => file.name.endsWith(".mcstructure"));
    if (mcstructureFiles.length > 0) {
        const dt = new DataTransfer();
        mcstructureFiles.forEach(f => dt.items.add(f));
        structureFilesInput.files = dt.files; // Substitui os arquivos existentes
        dispatchInputEvents(structureFilesInput);
    } else {
        console.warn("No .mcstructure files found in dropped items for PWA/general drop.");
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

    if (!texturePreviewImageCont || !texturePreviewName || !structureFilesInput || structureFilesInput.files.length === 0) {
        if(texturePreviewName) texturePreviewName.textContent = defaultText;
        if(texturePreviewImageCont) {
            Array.from(texturePreviewImageCont.children).forEach(child => {
                if (child !== texturePreviewLoader && child !== texturePreviewName) {
                    child.remove();
                }
            });
             // Garantir que o texto de "No file selected" seja exibido se não houver loader e o nome já estiver lá
            if (!texturePreviewImageCont.querySelector("p#texturePreviewName") && texturePreviewName) {
                 texturePreviewImageCont.appendChild(texturePreviewName);
            }
        }
        return;
    }

    const file = structureFilesInput.files[0];
    texturePreviewName.textContent = removeFileExtension(file.name);
    if(texturePreviewLoader) texturePreviewLoader.classList.remove("hidden");
    
    texturePreviewImageCont.querySelectorAll("img, canvas, p:not(#texturePreviewName)").forEach(el => el.remove());

    try {
        console.warn("Texture preview generation for '" + file.name + "' is a placeholder.");
        await sleep(500); 
        if(texturePreviewLoader) texturePreviewLoader.classList.add("hidden");
        const placeholderText = document.createElement("p");
        placeholderText.textContent = `Preview for ${file.name} (Not Implemented Yet)`;
        placeholderText.style.color = "var(--secondary-text-color)";
        texturePreviewImageCont.appendChild(placeholderText);

    } catch (error) {
        console.error("Error generating texture preview:", error);
        if(texturePreviewLoader) texturePreviewLoader.classList.add("hidden");
        texturePreviewName.textContent = translateCurrentLanguage("preview.error_loading") || "Error loading preview";
    }
}

async function setupLanguageSelector() {
    if (!languageSelector) {
        console.warn("Language selector element not found. Defaulting to English.");
        await translatePage("en_US");
        return;
    }

    try {
        const response = await fetch("translations/languages.json");
        if (!response.ok) throw new Error(`Failed to load languages.json: ${response.status}`);
        const languagesAndNames = await response.json();
        
        const sortedLanguages = Object.entries(languagesAndNames).sort((a, b) => a[1].localeCompare(b[1]));
        
        if (sortedLanguages.length === 0) {
            console.warn("No languages found in languages.json. Defaulting to English.");
            await translatePage("en_US");
            if (languageSelector.parentElement) languageSelector.parentElement.classList.add("hidden");
            return;
        }
        
        let browserLang = (navigator.language || navigator.userLanguage || "en_US").replace("-", "_");
        let defaultLanguage = sortedLanguages.find(([code]) => code.toLowerCase() === browserLang.toLowerCase())?.[0] ||
                              sortedLanguages.find(([code]) => code.split("_")[0].toLowerCase() === browserLang.split("_")[0].toLowerCase())?.[0] ||
                              sortedLanguages[0][0]; // Fallback para o primeiro da lista

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
        console.error("Error setting up language selector:", error);
        await translatePage("en_US"); // Fallback final
        if (languageSelector.parentElement) languageSelector.parentElement.classList.add("hidden");
    }
}

async function translatePage(languageCode) {
    try {
        await loadTranslationLanguage(languageCode); 
    } catch (e) {
        console.error(`Failed to load translation file for ${languageCode}:`, e);
        if (languageCode !== "en_US") {
            console.warn("Falling back to English (en_US) translation for UI.");
            try {
                await loadTranslationLanguage("en_US");
                languageCode = "en_US"; 
            } catch (e2) {
                console.error("Failed to load English fallback translation:", e2);
                return; // Não há mais o que fazer
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
            const authorSub = element.dataset.translationSubAuthor;
            const versionSub = element.dataset.translationSubVersion || HOLOLAB_APP_VERSION;
            const countSub = element.dataset.translationSubCount;


            if (authorSub) finalTranslation = finalTranslation.replace(/{AUTHOR}/g, authorSub);
            if (versionSub) finalTranslation = finalTranslation.replace(/{VERSION}/g, versionSub);
            if (countSub) {
                finalTranslation = finalTranslation.replace(/{COUNT}/g, countSub);
                if (parseInt(countSub) > 1) {
                    finalTranslation = finalTranslation.replace(/\[s\]/g, 's').replace(/\[es\]/g, 'es'); // Plural simples
                } else {
                    finalTranslation = finalTranslation.replace(/\[s\]/g, '').replace(/\[es\]/g, '');
                }
                finalTranslation = finalTranslation.replace(/\[|\]/g, ''); // Remove colchetes restantes
            }
            
            const targetAttr = Object.keys(element.dataset).find(k => k.startsWith("translate") && k !== "translate" && k !== "translationSubAuthor" && k !== "translationSubVersion" && k !== "translationSubCount" );

            if (targetAttr) {
                const attributeName = targetAttr.substring('translate'.length).toLowerCase();
                if (attributeName === 'placeholder' || attributeName === 'title' || attributeName === 'value' || attributeName === 'alt') {
                    element[attributeName] = finalTranslation;
                } else {
                     element.setAttribute(attributeName, finalTranslation);
                }
            } else {
                element.innerHTML = finalTranslation; 
            }
        } else {
            // Não exibir aviso para chaves que podem ser de atributos e não ter tradução direta no innerHTML
            // console.warn(`Missing translation for key "${key}" (lang: ${languageCode}).`);
        }
    });
}


function translateCurrentLanguage(translationKey) {
	if(!languageSelector) {
		// Se o seletor de idioma não estiver pronto, tenta carregar inglês como fallback
		const fallbackTranslation = translate(translationKey, "en_US");
        return fallbackTranslation === undefined ? translationKey : fallbackTranslation;
	}
	let currentLang = languageSelector.value;
	let translation = translate(translationKey, currentLang);

	if(translation === undefined && currentLang !== "en_US") {
		translation = translate(translationKey, "en_US"); 
		if(translation !== undefined) {
			// console.warn(`Translation for "${translationKey}" not found in "${currentLang}". Using English fallback.`);
		} else {
			// console.warn(`Translation for "${translationKey}" not found in "${currentLang}" or English.`);
			return translationKey; 
		}
	} else if (translation === undefined) {
        // console.warn(`Translation for "${translationKey}" not found in English.`);
        return translationKey;
    }
	return translation;
}


/**
 * @param {Array<File>} files
 * @param {Array<LocalResourcePack>} localResourcePacks
 * @returns {Promise<void>}
 */
async function makePackAndHandleUI(files, localResourcePacks) {
	if (!generatePackFormSubmitButton || !completedPacksCont) {
        console.error("UI elements for pack generation not found.");
        return;
    }
    generatePackFormSubmitButton.disabled = true;
	
	let formData = new FormData(generatePackForm);
    let authors = [];
    const authorField = formData.get("author");
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
		DESCRIPTION: undefined, // Descrição do formulário não é mais usada aqui
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
    if (localResourcePacks && localResourcePacks.length > 0) { // Não usado na UI atual, mas mantido
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
			console.error(`Pack creation failed!\n${e.stack || e}`);
			if(!(e instanceof UserError)) {
				generationFailedError = e;
			}
			if(!(e instanceof DOMException)) { 
				console.debug(getStackTrace(e).join("\n"));
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
