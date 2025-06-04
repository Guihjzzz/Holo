import { extractStructureFilesFromMcworld } from "mcbe-leveldb-reader";
import { selectEl, selectEls, loadTranslationLanguage, translate, getStackTrace, random, UserError, joinOr, conditionallyGroup, groupByFileExtension, addFilesToFileInput, setFileInputFiles, dispatchInputEvents, removeFileExtension } from "./essential.js";
import * as HoloPrint from "./HoloPrint.js";

import ResourcePackStack from "./ResourcePackStack.js";
import LocalResourcePack from "./LocalResourcePack.js";
import TextureAtlas from "./TextureAtlas.js";
// ItemCriteriaInput não está sendo usado diretamente na nova UI principal, mas é usado por HoloPrint.js internamente
// import ItemCriteriaInput from "./components/ItemCriteriaInput.js";
import FileInputTable from "./components/FileInputTable.js";
import SimpleLogger from "./components/SimpleLogger.js";

const IN_PRODUCTION = false;
const ACTUAL_CONSOLE_LOG = false;

const HOLOLAB_APP_VERSION = "1.0.0-HoloLab";

let dropFileNotice;
let generatePackForm;
let generatePackFormSubmitButton;
let structureFilesInput;
let structureFilesTable; // Este é o elemento <file-input-table>

let packNameInput;
let completedPacksCont;
let logger;
let errorLogContainer;

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
    generatePackFormSubmitButton = selectEl("#generatePackButton"); // Corrigido ID
    structureFilesInput = selectEl("#structureFilesInput");
    dropZoneStructure = selectEl("#dropZoneStructure");
    structureFilesTable = selectEl("#structureFilesTable"); 
    texturePreviewImageCont = selectEl("#texturePreviewImageCont");
    texturePreviewName = selectEl("#texturePreviewName");
    if (texturePreviewImageCont) { // Garante que texturePreviewImageCont existe antes de buscar o loader
        texturePreviewLoader = texturePreviewImageCont.querySelector(".loader");
    }
    
    packNameInput = generatePackForm.elements.namedItem("packName");
    completedPacksCont = selectEl("#completedPacksCont");
    errorLogContainer = selectEl("#errorLogContainer");

    if(!ACTUAL_CONSOLE_LOG) {
        logger = document.createElement("simple-logger");
        if (errorLogContainer) {
            errorLogContainer.innerHTML = ''; 
            errorLogContainer.appendChild(logger);
        } else {
            document.body.appendChild(logger);
        }
		logger.patchConsoleMethods();
	}
    
    if (structureFilesTable && structureFilesInput) {
        structureFilesTable.fileInput = structureFilesInput; // Associa o input ao componente
         // O componente FileInputTable deve lidar com a atualização de sua própria exibição
        structureFilesInput.addEventListener("input", () => {
            // Disparar um evento customizado ou chamar um método se FileInputTable não o fizer automaticamente
            structureFilesTable.dispatchEvent(new CustomEvent('filesupdated'));
        });
    } else {
        console.warn("Structure files input or table not found for initialization.");
    }

	packNameInput?.addEventListener("invalid", () => {
		packNameInput.setCustomValidity(translateCurrentLanguage("metadata.pack_name.error") || "Pack name cannot contain '/'");
	});
	packNameInput?.addEventListener("input", () => {
		packNameInput.setCustomValidity("");
	});

    setupStructureFileHandling();

	structureFilesInput.addEventListener("input", () => {
        updatePackNameInputPlaceholder();
        updateTexturePreview();
        // Certifique-se que FileInputTable atualize sua exibição
        if (structureFilesTable) {
            structureFilesTable.dispatchEvent(new CustomEvent('filesupdated'));
        }
    });
    updatePackNameInputPlaceholder(); 
    updateTexturePreview(); // Chamar para estado inicial (sem arquivos)

	defaultResourcePackStackPromise = new ResourcePackStack();
	
	if(location.search == "?loadFile") { 
		window.launchQueue?.setConsumer(async launchParams => {
			let launchFiles = await Promise.all(launchParams.files.map(fileHandle => fileHandle.getFile()));
			handleDroppedFiles(launchFiles); 
		});
	}
	
	generatePackForm.addEventListener("submit", async (e) => {
		e.preventDefault();
		const filesToProcess = Array.from(structureFilesInput.files); // Pega os arquivos do input
        if (filesToProcess.length === 0) {
            alert(translateCurrentLanguage("upload.error.no_file_selected") || "Please select a .mcstructure file.");
            return;
        }
		makePackAndHandleUI(filesToProcess, []); // Passa os arquivos do input
	});
	
	generatePackForm.addEventListener("input", e => {
        // Exemplo: Atualizar preview dinâmico se opções de textura forem re-adicionadas
		// if(e.target.closest("#hologram-options-section") && e.target.hasAttribute("name")) {
		// 	// updateDynamicTexturePreviewBasedOnOptions(); 
		// }
	});
	
    languageSelector = selectEl("#languageSelector");
	setupLanguageSelector(); // Configurar o seletor de idiomas
});

function setupStructureFileHandling() {
    if (!dropZoneStructure || !structureFilesInput) return;

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
        if (e.dataTransfer.files.length) {
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

    let dragCounter = 0;
	document.documentElement.addEventListener("dragenter", (e) => {
        if (e.dataTransfer.types.includes("Files")) {
            dragCounter++;
            showDropNotice(true);
        }
    });
	document.documentElement.addEventListener("dragleave", (e) => {
        const rect = document.documentElement.getBoundingClientRect();
        // Verifica se o mouse realmente saiu da janela do navegador
        if (e.clientX <= rect.left || e.clientX >= rect.right || e.clientY <= rect.top || e.clientY >= rect.bottom) {
            dragCounter--;
            if (dragCounter === 0) {
                showDropNotice(false);
            }
        }
    });
    document.documentElement.addEventListener("dragover", e => {
        if (e.dataTransfer.types.includes("Files")) {
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
        // Criar um novo DataTransfer e definir os arquivos no input
        const dt = new DataTransfer();
        mcstructureFiles.forEach(f => dt.items.add(f));
        structureFilesInput.files = dt.files;
        dispatchInputEvents(structureFilesInput); // Dispara o evento para atualizar a UI (ex: FileInputTable)
    } else {
        console.warn("No .mcstructure files found in dropped items for PWA.");
    }
}


function updatePackNameInputPlaceholder() {
	if (packNameInput && structureFilesInput) { // Adicionada verificação para structureFilesInput
        packNameInput.placeholder = HoloPrint.getDefaultPackName([...structureFilesInput.files]);
    }
}

async function updateTexturePreview() {
    const defaultText = translateCurrentLanguage("preview.no_file_selected") || "No file selected";
    if (texturePreviewLoader) texturePreviewLoader.classList.add("hidden"); // Esconde o loader por padrão

    if (!texturePreviewImageCont || !texturePreviewName || !structureFilesInput || structureFilesInput.files.length === 0) {
        if(texturePreviewName) texturePreviewName.textContent = defaultText;
        if(texturePreviewImageCont) {
            // Limpa qualquer imagem/canvas/texto de erro anterior, exceto o loader e o p#texturePreviewName
            Array.from(texturePreviewImageCont.children).forEach(child => {
                if (child !== texturePreviewLoader && child !== texturePreviewName) {
                    child.remove();
                }
            });
        }
        return;
    }

    const file = structureFilesInput.files[0];
    texturePreviewName.textContent = removeFileExtension(file.name);
    if(texturePreviewLoader) texturePreviewLoader.classList.remove("hidden");
    
    // Limpa apenas previews de imagem/canvas anteriores
    texturePreviewImageCont.querySelectorAll("img, canvas, p:not(#texturePreviewName)").forEach(el => el.remove());

    try {
        // A lógica real de geração de preview de textura precisa ser implementada aqui.
        // Isso envolveria chamar HoloPrint.js ou módulos relacionados.
        // Por enquanto, apenas um placeholder.
        console.warn("Texture preview generation logic is a placeholder for: " + file.name);
        await sleep(500); // Simula carregamento
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
        console.warn("Language selector not found.");
        await translatePage("en_US"); // Tenta traduzir para inglês como fallback
        return;
    }

    try {
        const response = await fetch("translations/languages.json");
        if (!response.ok) throw new Error(`Failed to load languages.json: ${response.status}`);
        const languagesAndNames = await response.json();
        
        const sortedLanguages = Object.entries(languagesAndNames).sort((a, b) => a[1].localeCompare(b[1]));
        
        if (sortedLanguages.length === 0) { // Caso languages.json esteja vazio
            console.warn("No languages found in languages.json");
            await translatePage("en_US");
            languageSelector.parentElement.classList.add("hidden");
            return;
        }
        
        if (sortedLanguages.length <= 1 && languageSelector.parentElement) {
            languageSelector.parentElement.classList.add("hidden"); 
            await translatePage(sortedLanguages[0]?.[0] || "en_US");
            return;
        }

        let browserLang = navigator.language || navigator.userLanguage || "en_US"; 
        let defaultLanguage = sortedLanguages.find(([code]) => code.replace("_", "-").toLowerCase() === browserLang.toLowerCase())?.[0] ||
                              sortedLanguages.find(([code]) => code.split(/[-_]/)[0].toLowerCase() === browserLang.split(/[-_]/)[0].toLowerCase())?.[0] ||
                              sortedLanguages[0][0] || // Fallback para o primeiro idioma da lista
                              "en_US";

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
        await translatePage("en_US");
        if (languageSelector.parentElement) languageSelector.parentElement.classList.add("hidden");
    }
}

async function translatePage(languageCode) {
    try {
        await loadTranslationLanguage(languageCode); 
    } catch (e) {
        console.error(`Failed to load translation file for ${languageCode}:`, e);
        if (languageCode !== "en_US") { // Tenta fallback para inglês se não for inglês
            console.warn("Falling back to English (en_US) translation.");
            await loadTranslationLanguage("en_US");
            languageCode = "en_US"; // Atualiza para refletir o fallback
        } else {
            return; // Se nem o inglês carregar, não há o que fazer.
        }
    }


    const elements = document.querySelectorAll("[data-translate]");
    elements.forEach(element => {
        const key = element.dataset.translate;
        let translation = translate(key, languageCode); 
        
        if (translation === undefined && languageCode !== "en_US") {
            translation = translate(key, "en_US"); // Fallback para inglês se a tradução específica não existir
        }

        if (translation !== undefined) {
            let finalTranslation = translation;
            const authorSub = element.dataset.translationSubAuthor;
            // Usar HOLOLAB_APP_VERSION para o placeholder {VERSION}
            const versionSub = element.dataset.translationSubVersion || HOLOLAB_APP_VERSION;


            if (authorSub) {
                finalTranslation = finalTranslation.replace(/{AUTHOR}/g, authorSub);
            }
            if (versionSub) {
                finalTranslation = finalTranslation.replace(/{VERSION}/g, versionSub);
            }
            
            if (element.hasAttribute('data-translate-placeholder')) {
                 element.placeholder = finalTranslation;
            } else if (element.hasAttribute('data-translate-title')) {
                 element.title = finalTranslation;
            } else {
                element.innerHTML = finalTranslation; 
            }
        } else {
            console.warn(`Missing translation for key "${key}" (lang: ${languageCode}).`);
        }
    });
    document.documentElement.lang = languageCode.split(/[-_]/)[0]; // Usa regex para split
}

function translateCurrentLanguage(translationKey) {
	if(!languageSelector) {
		return translationKey; // Retorna a chave se o seletor não existir
	}
	let currentLang = languageSelector.value;
	let translation = translate(translationKey, currentLang);
	if(translation === undefined && currentLang !== "en_US") {
		translation = translate(translationKey, "en_US"); 
		if(translation !== undefined) {
			console.warn(`Translation for "${translationKey}" not found in "${currentLang}". Using English fallback.`);
		} else {
			console.warn(`Translation for "${translationKey}" not found in "${currentLang}" or English.`);
			return translationKey; // Retorna a chave se nenhuma tradução for encontrada
		}
	} else if (translation === undefined) {
        console.warn(`Translation for "${translationKey}" not found in English.`);
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
	if (!generatePackFormSubmitButton || !completedPacksCont) return;
    generatePackFormSubmitButton.disabled = true;
	
	let formData = new FormData(generatePackForm);
	let authors = formData.get("author")?.split(",").map(x => x.trim()).filter(Boolean) ?? [];
	
	/** @type {import("./HoloPrint.js").HoloPrintConfig} */
	let config = {
		IGNORED_BLOCKS: formData.get("ignoredBlocks")?.split(/\W/).filter(Boolean) ?? HoloPrint.IGNORED_BLOCKS,
		SCALE: formData.get("scale") ? parseFloat(formData.get("scale")) / 100 : 0.95,
		TINT_COLOR: formData.get("tintColor")?.toString() || "#579EFA",
		TINT_OPACITY: formData.get("tintOpacity") ? parseFloat(formData.get("tintOpacity")) / 100 : 0.2,
        TEXTURE_OUTLINE_WIDTH: formData.get("textureOutlineWidth") ? parseFloat(formData.get("textureOutlineWidth")) : 0.25,
        TEXTURE_OUTLINE_COLOR: formData.get("textureOutlineColor")?.toString() || "#0000FF",
        TEXTURE_OUTLINE_OPACITY: formData.get("textureOutlineOpacity") ? parseFloat(formData.get("textureOutlineOpacity")) / 100 : 0.65,
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
		DESCRIPTION: formData.get("description")?.toString() || undefined, 
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
