import { extractStructureFilesFromMcworld } from "mcbe-leveldb-reader";
import { selectEl, downloadBlob, sleep, selectEls, loadTranslationLanguage, translate, getStackTrace, random, UserError, joinOr, conditionallyGroup, groupByFileExtension, addFilesToFileInput, setFileInputFiles, dispatchInputEvents, removeFileExtension } from "./essential.js";
import * as HoloPrint from "./HoloPrint.js"; // Seu HoloPrint.js modificado

import ResourcePackStack from "./ResourcePackStack.js";
import LocalResourcePack from "./LocalResourcePack.js";
import TextureAtlas from "./TextureAtlas.js";
import ItemCriteriaInput from "./components/ItemCriteriaInput.js"; // Mantido, pois é usado no formulário
import FileInputTable from "./components/FileInputTable.js";
import SimpleLogger from "./components/SimpleLogger.js";

const IN_PRODUCTION = false;
const ACTUAL_CONSOLE_LOG = false;
const HOLOLAB_APP_VERSION = "HoloLab dev"; // Para o rodapé e metadados

let dropFileNotice;
let generatePackForm;
let generatePackFormSubmitButton;
let structureFilesInput;
let worldFileInput; // Mantido
let oldPackInput;   // Mantido
let structureFilesList; // Este é o <input type="file" id="structureFilesList"> dentro do file-input-table
let packNameInput;
let completedPacksCont;
let logger; // Instância do SimpleLogger
let languageSelector;
let defaultResourcePackStackPromise;

// Para a seção de preview de textura do HoloPrint original
let texturePreviewImageCont; // #texturePreviewImageCont (onde o canvas/imagem do preview é inserido)
let texturePreviewImage; // Imagem de exemplo para o preview de textura (opcional)


document.addEventListener("DOMContentLoaded", () => {
	document.body.appendChild = selectEl("main").appendChild.bind(selectEl("main"));
	
	selectEls(`input[type="file"][accept]:not([multiple])`).forEach(input => {
		input.addEventListener("input", e => { // Alterado para addEventListener
			if(!validateFileInputFileTypes(input)) {
				e?.stopImmediatePropagation();
			}
		});
        // Disparar uma vez para validar o estado inicial (se houver arquivos pré-selecionados)
        if(!validateFileInputFileTypes(input) && input.files.length > 0) {
            // Lógica para lidar com erro inicial, se necessário
        }
	});
	
	generatePackForm = selectEl("#generatePackForm");
	dropFileNotice = selectEl("#dropFileNotice");
	structureFilesInput = selectEl("#structureFilesInput"); // Input da primeira aba
	let notStructureFileError = selectEl("#notStructureFileError");
	worldFileInput = selectEl("#worldFileInput"); // Input da segunda aba
	let worldExtractionMessage = selectEl("#worldExtractionMessage");
	let worldExtractionSuccess = selectEl("#worldExtractionSuccess");
	let worldExtractionError = selectEl("#worldExtractionError");
	let worldExtractionWorldError = selectEl("#worldExtractionWorldError");
	oldPackInput = selectEl("#oldPackInput"); // Input da terceira aba
	let oldPackExtractionMessage = selectEl("#oldPackExtractionMessage");
	let oldPackExtractionSuccess = selectEl("#oldPackExtractionSuccess");
	let oldPackExtractionError = selectEl("#oldPackExtractionError");
	
    structureFilesList = selectEl("#structureFilesList"); // O <input type="file"> dentro de <file-input-table>
    const fileTableComponent = selectEl("file-input-table");
    if (fileTableComponent && structureFilesList) {
        fileTableComponent.fileInput = structureFilesList; // Associa o input ao componente
    }


	packNameInput = generatePackForm.elements.namedItem("packName");
	packNameInput.addEventListener("invalid", () => { // Alterado para addEventListener
		packNameInput.setCustomValidity(translateCurrentLanguage("metadata.pack_name.error") || "Pack name cannot contain '/'");
	});
	packNameInput.addEventListener("input", () => { // Alterado para addEventListener
		packNameInput.setCustomValidity("");
	});

	structureFilesInput.addEventListener("input", () => { // Alterado para addEventListener
		if(!structureFilesInput.files.length) {
			return;
		}
		let files = Array.from(structureFilesInput.files);
		let filesToAdd = files.filter(file => file.name.endsWith(".mcstructure"));
		if(files.length == filesToAdd.length) {
			notStructureFileError.classList.add("hidden");
			structureFilesInput.setCustomValidity("");
		} else {
			notStructureFileError.classList.remove("hidden");
			structureFilesInput.setCustomValidity(notStructureFileError.textContent || "Please upload only .mcstructure files.");
		}
		addFilesToFileInput(structureFilesList, filesToAdd); // Adiciona ao input dentro da tabela
        dispatchInputEvents(structureFilesList); // Notifica a tabela
	});

	worldFileInput.addEventListener("input", async () => { // Alterado para addEventListener
		worldExtractionMessage.classList.add("hidden");
		worldExtractionSuccess.classList.add("hidden");
		worldExtractionError.classList.add("hidden");
		worldExtractionWorldError.classList.add("hidden");
		worldFileInput.setCustomValidity(""); // Limpar validade anterior
		let worldFile = worldFileInput.files[0];
		if(!worldFile) {
			return;
		}
		selectEl("#extractFromWorldTab").checked = true;
		worldExtractionMessage.classList.remove("hidden");
		worldExtractionMessage.scrollIntoView({ block: "center" });
		let structureFiles;
		try {
			structureFiles = await extractStructureFilesFromMcworld(worldFile);
		} catch(e) {
			worldExtractionMessage.classList.add("hidden");
			worldExtractionWorldError.dataset.translationSubError = e.message || e.toString();
			worldExtractionWorldError.classList.remove("hidden");
			worldFileInput.setCustomValidity(worldExtractionWorldError.textContent || "Invalid world file.");
			await translatePage(languageSelector.value); // Re-traduzir para exibir erro
			return;
		}
		worldExtractionMessage.classList.add("hidden");
		if(structureFiles.size) {
			addFilesToFileInput(structureFilesList, Array.from(structureFiles.values()));
            dispatchInputEvents(structureFilesList); // Notifica a tabela
			worldExtractionSuccess.dataset.translationSubCount = structureFiles.size.toString();
			worldExtractionSuccess.classList.remove("hidden");
		} else {
			worldExtractionError.classList.remove("hidden");
			worldFileInput.setCustomValidity(worldExtractionError.textContent || "No saved structures found!");
		}
        await translatePage(languageSelector.value); // Re-traduzir
	});

	oldPackInput.addEventListener("input", async () => { // Alterado para addEventListener
		oldPackExtractionMessage.classList.add("hidden");
		oldPackExtractionSuccess.classList.add("hidden");
		oldPackExtractionError.classList.add("hidden");
		oldPackInput.setCustomValidity(""); // Limpar validade anterior
		let oldPack = oldPackInput.files[0];
		if(!oldPack) {
			return;
		}
		selectEl("#updatePackTab").checked = true;
		oldPackExtractionMessage.classList.remove("hidden");
		oldPackExtractionMessage.scrollIntoView({ block: "center" });
		let extractedStructureFiles;
        try {
            extractedStructureFiles = await HoloPrint.extractStructureFilesFromPack(oldPack);
        } catch(e) {
            oldPackExtractionMessage.classList.add("hidden");
            oldPackExtractionError.classList.remove("hidden");
            oldPackInput.setCustomValidity(oldPackExtractionError.textContent || "Pack is not a valid HoloLab pack!");
            await translatePage(languageSelector.value); // Re-traduzir para exibir erro
            return;
        }

		oldPackExtractionMessage.classList.add("hidden");
		if(extractedStructureFiles && extractedStructureFiles.length) {
			addFilesToFileInput(structureFilesList, extractedStructureFiles);
            dispatchInputEvents(structureFilesList); // Notifica a tabela
			oldPackExtractionSuccess.classList.remove("hidden");
		} else {
			oldPackExtractionError.classList.remove("hidden");
			oldPackInput.setCustomValidity(oldPackExtractionError.textContent || "Pack is not a valid HoloLab pack!");
		}
        await translatePage(languageSelector.value); // Re-traduzir
	});

	structureFilesList.addEventListener("input", updatePackNameInputPlaceholder); // Alterado para addEventListener
    updatePackNameInputPlaceholder(); // Chamada inicial

	completedPacksCont = selectEl("#completedPacksCont");
	texturePreviewImageCont = selectEl("#texturePreviewImageCont"); // Para o preview do HoloPrint original
	defaultResourcePackStackPromise = new ResourcePackStack();
	
	if(location.search == "?loadFile") {
		window.launchQueue?.setConsumer(async launchParams => {
            if (launchParams.files && launchParams.files.length > 0) {
			    const files = await Promise.all(launchParams.files.map(fileHandle => fileHandle.getFile()));
			    handleDroppedFilesGlobal(files); // Função para lidar com arquivos soltos
            }
		});
	}
	
	let dragCounter = 0;
	document.documentElement.addEventListener("dragenter", (e) => {
        if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
            dragCounter++;
            showDropNotice(true);
        }
    });
	document.documentElement.addEventListener("dragover", e => {
		if(e.dataTransfer?.types?.includes("Files")) {
			e.preventDefault();
			showDropNotice(true);
		}
	});
	document.documentElement.addEventListener("dragleave", (e) => {
        if (!document.documentElement.contains(e.relatedTarget as Node)) {
            dragCounter--;
            if (dragCounter <= 0) {
                showDropNotice(false);
                dragCounter = 0;
            }
        }
	});
	document.documentElement.addEventListener("drop", async e => {
		e.preventDefault();
		dragCounter = 0;
		showDropNotice(false);
        if (e.dataTransfer && e.dataTransfer.files) {
		    handleDroppedFilesGlobal([...e.dataTransfer.files]);
        }
	});
	
	customElements.define("item-criteria-input", class extends ItemCriteriaInput {
		constructor() {
			super(translateCurrentLanguage);
		}
	});
	// FileInputTable e SimpleLogger já são definidos por importação direta
	
	generatePackForm.addEventListener("submit", async e => { // Alterado para addEventListener
		e.preventDefault();
		
		let formData = new FormData(generatePackForm);
		let resourcePacks = [];
		let localResourcePackFiles = generatePackForm.elements.namedItem("localResourcePack")?.files;
		if(localResourcePackFiles?.length) {
            try {
			    resourcePacks.push(await new LocalResourcePack(localResourcePackFiles));
            } catch (err) {
                logger?.error("Failed to process local resource pack:", err);
                // Poderia adicionar um UserError aqui
            }
		}
        const filesToProcess = Array.from(structureFilesList.files);
        if (filesToProcess.length === 0) {
            alert(translateCurrentLanguage("upload.error.no_file_selected") || "Please select at least one .mcstructure file.");
            return;
        }
		makePackAndDisplayResult(filesToProcess, resourcePacks);
	});

	generatePackForm.addEventListener("input", e => { // Alterado para addEventListener
		if(e.target.closest("fieldset")?.classList?.contains("textureSettings") && e.target.hasAttribute("name")) {
			updateTexturePreviewOriginal(); // Renomeado para não confundir
		}
	});
	updateTexturePreviewOriginal(); // Chamada inicial para o preview do HoloPrint original

	generatePackFormSubmitButton = generatePackForm.elements.namedItem("submit");
	
	let opacityModeSelect = generatePackForm.elements.namedItem("opacityMode");
	opacityModeSelect?.addEventListener("input", () => { // Alterado para addEventListener e input
		const opacityInputParent = generatePackForm.elements.namedItem("opacity")?.parentElement;
        if (opacityInputParent) {
            opacityInputParent.classList.toggle("hidden", opacityModeSelect.value == "multiple");
        }
	});
    if (opacityModeSelect) dispatchInputEvents(opacityModeSelect); // Trigger inicial


	let descriptionTextArea = generatePackForm.elements.namedItem("description");
	let descriptionLinksCont = selectEl("#descriptionLinksCont");
	descriptionTextArea?.addEventListener("input", () => { // Alterado para addEventListener
		if (!descriptionLinksCont) return;
        descriptionLinksCont.innerHTML = ''; // Limpar antes de adicionar
		let links = HoloPrint.findLinksInDescription(descriptionTextArea.value);
		links.forEach(([_, link], i) => {
			if(i) {
				descriptionLinksCont.appendChild(document.createElement("br"));
			}
			descriptionLinksCont.insertAdjacentHTML("beforeend", `<span data-translate="metadata.description.link_found">Link found:</span> `);
			descriptionLinksCont.insertAdjacentText("beforeend", link);
		});
        translatePage(languageSelector.value); // Re-traduzir para o span
	});
    if (descriptionTextArea) dispatchInputEvents(descriptionTextArea);


	let playerControlsInputCont = selectEl("#playerControlsInputCont");
    if (playerControlsInputCont) {
        Object.entries(HoloPrint.DEFAULT_PLAYER_CONTROLS).forEach(([control, itemCriteria]) => { // Usar forEach
            let label = document.createElement("label");
            let playerControlTranslationKey = HoloPrint.PLAYER_CONTROL_NAMES[control];
            label.innerHTML = `<span data-translate="${playerControlTranslationKey}">...</span>:`;
            let input = document.createElement("item-criteria-input");
            input.setAttribute("name", `control.${control}`);
            if(itemCriteria["names"].length > 0) {
                input.setAttribute("value-items", itemCriteria["names"].join(","));
            }
            if(itemCriteria["tags"].length > 0) {
                input.setAttribute("value-tags", itemCriteria["tags"].join(","));
            }
            label.appendChild(input);
            playerControlsInputCont.appendChild(label);
            // O default é setado pelo componente, mas podemos forçar aqui se necessário ao conectar
             input.setAttribute("default", input.value);
        });
    }
	
	let clearResourcePackCacheButton = selectEl("#clearResourcePackCacheButton");
	clearResourcePackCacheButton?.addEventListener("click", async () => { // Alterado para addEventListener
		await caches.clear(); // Adicionado await
		temporarilyChangeText(clearResourcePackCacheButton, clearResourcePackCacheButton.dataset.resetTranslation);
	});
	
	selectEls(".resetButton").forEach(el => {
		el.addEventListener("click", () => { // Alterado para addEventListener
			let fieldset = el.closest("fieldset"); // Usar closest
            if (!fieldset) return;

			let elementsToSave = [];
            let valuesToSave = [];

            // Salvar valores de inputs fora do fieldset atual ou que não têm 'name'
            Array.from(generatePackForm.elements).forEach(formEl => {
                if (formEl.type !== "fieldset" && formEl.type !== "button" && formEl.type !== "submit" && formEl.type !== "reset") {
                    if (!fieldset.contains(formEl) || !formEl.hasAttribute("name")) {
                        elementsToSave.push(formEl);
                        if (formEl.type === 'file') {
                            const dt = new DataTransfer();
                            Array.from(formEl.files).forEach(f => dt.items.add(f));
                            valuesToSave.push(dt.files);
                        } else if (formEl.type === 'checkbox' || formEl.type === 'radio') {
                            valuesToSave.push(formEl.checked);
                        } else {
                            valuesToSave.push(formEl.value);
                        }
                    }
                }
            });
            
            // Resetar apenas os inputs DENTRO do fieldset atual que têm 'name'
            fieldset.querySelectorAll('input[name], select[name], textarea[name]').forEach(inputInFieldset => {
                 if (inputInFieldset.type === 'file') {
                    inputInFieldset.value = ''; // Limpa file input
                } else if (inputInFieldset.type === 'checkbox' || inputInFieldset.type === 'radio') {
                    inputInFieldset.checked = inputInFieldset.defaultChecked;
                } else if (inputInFieldset.formNoValidate === false && inputInFieldset.defaultValue !== undefined) { // para selects e text/number
                    inputInFieldset.value = inputInFieldset.defaultValue;
                 } else { // fallback para string vazia se não houver defaultValue
                    inputInFieldset.value = '';
                 }
                dispatchInputEvents(inputInFieldset);
            });


            // Restaurar valores dos inputs que não deveriam ser resetados
            elementsToSave.forEach((savedEl, i) => {
                if (savedEl.type === 'file') {
                    savedEl.files = valuesToSave[i];
                } else if (savedEl.type === 'checkbox' || savedEl.type === 'radio') {
                    savedEl.checked = valuesToSave[i];
                } else {
                    savedEl.value = valuesToSave[i];
                }
                // Não precisa de dispatchInputEvents aqui, pois eles não foram resetados
            });

			temporarilyChangeText(el, el.dataset.resetTranslation);
		});
	});
	
	languageSelector = selectEl("#languageSelector");
	setupLanguageSelector(); // Movido para o final de DOMContentLoaded para garantir que outros scripts/componentes tenham sido carregados
}); // Fim do DOMContentLoaded


// window.addEventListener("load", () => { // 'load' pode ser muito tarde para algumas inicializações de UI
// 	if(location.search == "?generateEnglishTranslations") { // Funcionalidade de desenvolvedor
// 		translatePage("en_US", true);
// 	}
// });

/**
 * Lida com arquivos soltos globalmente ou via PWA.
 * Prioriza o input ativo ou o primeiro input de estrutura.
 * @param {Array<File>} files
 */
function handleDroppedFilesGlobal(files) {
    const mcstructureFiles = files.filter(f => f.name.endsWith(".mcstructure"));
    const mcpackFiles = files.filter(f => f.name.endsWith(".mcpack"));
    const worldFiles = files.filter(f => f.name.endsWith(".mcworld") || f.name.endsWith(".zip"));

    if (mcstructureFiles.length > 0) {
        selectEl("#structureFilesTab").checked = true;
        const dt = new DataTransfer();
        mcstructureFiles.forEach(f => dt.items.add(f));
        structureFilesInput.files = dt.files;
        dispatchInputEvents(structureFilesInput);
    } else if (mcpackFiles.length > 0 && oldPackInput) {
        selectEl("#updatePackTab").checked = true;
        const dt = new DataTransfer();
        dt.items.add(mcpackFiles[0]); // Apenas o primeiro .mcpack
        oldPackInput.files = dt.files;
        dispatchInputEvents(oldPackInput);
    } else if (worldFiles.length > 0 && worldFileInput) {
        selectEl("#extractFromWorldTab").checked = true;
        const dt = new DataTransfer();
        dt.items.add(worldFiles[0]); // Apenas o primeiro world file
        worldFileInput.files = dt.files;
        dispatchInputEvents(worldFileInput);
    } else {
        logger?.warn("No compatible files (.mcstructure, .mcpack, .mcworld, .zip) found in dropped items.");
    }
}


function updatePackNameInputPlaceholder() {
	if (packNameInput && structureFilesList) { // structureFilesList é o input dentro da tabela
        packNameInput.placeholder = HoloPrint.getDefaultPackName([...structureFilesList.files]);
    }
}

// Função de preview de textura original do HoloPrint (simplificada)
async function updateTexturePreviewOriginal() {
	if (!texturePreviewImageCont) return;
    texturePreviewImageCont.innerHTML = '<div class="loader"></div>'; // Mostrar loader

	texturePreviewImage = texturePreviewImage || await defaultResourcePackStackPromise.then(rps => rps.fetchResource(`textures/blocks/${random(["crafting_table_front", "diamond_ore", "blast_furnace_front_off", "brick", "cherry_planks", "chiseled_copper", "cobblestone", "wool_colored_white", "stonebrick", "stone_granite_smooth"])}.png`)).then(res => res.toImage());
	
    if (!texturePreviewImage) {
        texturePreviewImageCont.innerHTML = '<p data-translate="preview.error_loading">Error loading preview image</p>';
        await translatePage(languageSelector.value);
        return;
    }

    let can = new OffscreenCanvas(texturePreviewImage.width, texturePreviewImage.height);
	let ctx = can.getContext("2d");
	ctx.drawImage(texturePreviewImage, 0, 0);
	
    const config = HoloPrint.addDefaultConfig({
		TEXTURE_OUTLINE_COLOR: generatePackForm.elements.namedItem("textureOutlineColor")?.value || "#0000FF",
		TEXTURE_OUTLINE_OPACITY: (generatePackForm.elements.namedItem("textureOutlineOpacity")?.valueAsNumber || 65) / 100,
		TEXTURE_OUTLINE_WIDTH: parseFloat(generatePackForm.elements.namedItem("textureOutlineWidth")?.value || "0.25")
	});

    let outlinedCan = config.TEXTURE_OUTLINE_WIDTH > 0? TextureAtlas.addTextureOutlines(can, [{
		x: 0, y: 0, w: can.width, h: can.height
	}], config) : can;
	
    let tintlessImage = await outlinedCan.convertToBlob().then(blob => blob.toImage());
	
    let outlinedCanCtx = outlinedCan.getContext("2d"); // Reobter contexto se outlinedCan for diferente
	outlinedCanCtx.fillStyle = generatePackForm.elements.namedItem("tintColor")?.value || "#579EFA";
	outlinedCanCtx.globalAlpha = (generatePackForm.elements.namedItem("tintOpacity")?.valueAsNumber || 20) / 100;
	outlinedCanCtx.fillRect(0, 0, outlinedCan.width, outlinedCan.height);
	let tintedImage = await outlinedCan.convertToBlob().then(blob => blob.toImage());
	
    texturePreviewImageCont.innerHTML = ""; // Limpar loader
	texturePreviewImageCont.appendChild(tintlessImage);
	texturePreviewImageCont.appendChild(tintedImage);
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
        
        // Manter uma referência aos listeners para removê-los se necessário
        const changeListener = async (event) => {
            await translatePage(event.target.value);
        };
        languageSelector.removeEventListener("change", changeListener); // Remover listener antigo se houver

        let browserLang = (navigator.language || navigator.userLanguage || "en_US").replace("-", "_");
        let defaultLanguage = sortedLanguages.find(([code]) => code.toLowerCase() === browserLang.toLowerCase())?.[0] ||
                              sortedLanguages.find(([code]) => code.split("_")[0].toLowerCase() === browserLang.split("_")[0].toLowerCase())?.[0] ||
                              sortedLanguages[0][0]; 

        languageSelector.innerHTML = ''; 
        sortedLanguages.forEach(([code, name]) => {
            const option = new Option(name, code);
            languageSelector.add(option);
        });
        
        try {
            languageSelector.value = defaultLanguage; 
        } catch (e) {
            logger?.warn(`Could not set default language to ${defaultLanguage}, falling back to first option.`, e);
            languageSelector.value = sortedLanguages[0][0];
        }
        
        await translatePage(languageSelector.value); 

        languageSelector.addEventListener("change", changeListener);

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

    const elements = document.querySelectorAll("[data-translate], [data-translate-placeholder], [data-translate-title]");
    elements.forEach(element => {
        const key = element.dataset.translate || element.dataset.translatePlaceholder || element.dataset.translateTitle;
        if (!key) return;

        let translation = translate(key, languageCode); 
        
        if (translation === undefined && languageCode !== "en_US") {
            translation = translate(key, "en_US");
        }

        if (translation !== undefined) {
            let finalTranslation = translation;
            
            Object.keys(element.dataset).forEach(dataKey => {
                if (dataKey.startsWith("translationSub")) {
                    const placeholder = dataKey.substring("translationSub".length).toUpperCase();
                    finalTranslation = finalTranslation.replaceAll(`{${placeholder}}`, element.dataset[dataKey]); // Usar replaceAll
                }
            });
            if (finalTranslation.includes("{VERSION}") && !element.dataset.translationSubVersion) {
                finalTranslation = finalTranslation.replaceAll(/{VERSION}/g, HOLOLAB_APP_VERSION);
            }

            if (element.dataset.translationSubCount) {
                const count = parseInt(element.dataset.translationSubCount);
                if (!isNaN(count)) {
                    if (count !== 1) { // Plural para > 1 ou 0
                        finalTranslation = finalTranslation.replace(/\[s\]/g, 's').replace(/\[es\]/g, 'es');
                    } else {
                        finalTranslation = finalTranslation.replace(/\[s\]/g, '').replace(/\[es\]/g, '');
                    }
                }
                finalTranslation = finalTranslation.replace(/\[|\]/g, '');
            }
            
            if (element.dataset.translatePlaceholder !== undefined) {
                 element.placeholder = finalTranslation;
            } else if (element.dataset.translateTitle !== undefined) {
                 element.title = finalTranslation;
            } else if (element.dataset.translate !== undefined) { // Somente se for o atributo principal
                element.innerHTML = finalTranslation; 
            }
        } else {
            // logger?.warn(`Missing translation for key "${key}" (lang: ${languageCode}).`);
        }
    });
}


function translateCurrentLanguage(translationKey) {
	if(!languageSelector || !languageSelector.value) { // Adicionado check para languageSelector.value
		const fallbackTranslation = translate(translationKey, "en_US");
        return fallbackTranslation === undefined ? translationKey : fallbackTranslation;
	}
	let currentLang = languageSelector.value;
	let translation = translate(translationKey, currentLang);

	if(translation === undefined && currentLang !== "en_US") {
		translation = translate(translationKey, "en_US"); 
		if(translation === undefined) {
			return translationKey; 
		}
	} else if (translation === undefined) {
        return translationKey;
    }
	return translation;
}


async function temporarilyChangeText(el, translationKey, duration = 2000) {
	if (!el) return;
    let originalText = el.textContent; // Salva o texto atual, não a chave de tradução
    let originalDisabledState = el.disabled;

	el.textContent = translateCurrentLanguage(translationKey) || translationKey; // Traduz o novo texto
	el.disabled = true; // Usar a propriedade disabled
	await sleep(duration);
	el.textContent = originalText;
	el.disabled = originalDisabledState;
}

function validateFileInputFileTypes(fileInput) {
	if (!fileInput || !fileInput.accept) return true; // Se não houver input ou accept, considera válido
    let acceptableFileExtensions = fileInput.accept.split(",").map(ext => ext.trim().toLowerCase());
	let valid = Array.from(fileInput.files).every(file => 
        acceptableFileExtensions.some(fileExtension => {
            if (fileExtension.startsWith(".")) { // ex: .mcstructure
                return file.name.toLowerCase().endsWith(fileExtension);
            } else { // ex: image/* (não tratado perfeitamente aqui, mas melhor que nada)
                return file.type.startsWith(fileExtension.replace(/\/\*$/, ''));
            }
        })
    );
	if(valid) {
		fileInput.setCustomValidity("");
	} else {
        const currentLang = languageSelector?.value || "en_US";
		const typeString = joinOr(acceptableFileExtensions, currentLang);
        const errorMsgTemplate = translateCurrentLanguage("upload.error.wrong_file_type") || "Please upload only {FILE_TYPE} files.";
		fileInput.setCustomValidity(errorMsgTemplate.replace("{FILE_TYPE}", typeString));
	}
	return valid;
}


async function makePackAndHandleUI(files, localResourcePacks) {
	if (!generatePackFormSubmitButton || !completedPacksCont) {
        logger?.error("UI elements for pack generation not found.");
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
        OPACITY: formData.get("opacityMode") === "single" ? (formData.get("opacity") ? parseFloat(formData.get("opacity").toString()) / 100 : 0.8) : 0.9, // Usar opacity do form se single
        MULTIPLE_OPACITIES: formData.get("opacityMode") === "multiple",
        MINI_SCALE: parseFloat(formData.get("miniSize")?.toString() || "0.125"),
        SPAWN_ANIMATION_LENGTH: 0.4, 
        RETEXTURE_CONTROL_ITEMS: !!formData.get("retextureControlItems"), 
        CONTROL_ITEM_TEXTURE_SCALE: formData.get("controlItemTextureScale") ? parseInt(formData.get("controlItemTextureScale").toString()) : 1,
        RENAME_CONTROL_ITEMS: !!formData.get("renameControlItems"), 
        WRONG_BLOCK_OVERLAY_COLOR: [1, 0, 0, 0.3], 
        INITIAL_OFFSET: [
            formData.get("initialOffsetX") ? parseInt(formData.get("initialOffsetX").toString()) : 0,
            formData.get("initialOffsetY") ? parseInt(formData.get("initialOffsetY").toString()) : 0,
            formData.get("initialOffsetZ") ? parseInt(formData.get("initialOffsetZ").toString()) : 0
        ],
        BACKUP_SLOT_COUNT: formData.get("backupSlotCount") ? parseInt(formData.get("backupSlotCount").toString()) : 10,
		PACK_NAME: formData.get("packName")?.toString() || undefined,
		PACK_ICON_BLOB: formData.get("packIcon") instanceof File && formData.get("packIcon").size > 0 ? formData.get("packIcon") : undefined,
		AUTHORS: authors,
		DESCRIPTION: formData.get("description")?.toString() || undefined, 
		COMPRESSION_LEVEL: formData.get("compressionLevel") ? parseInt(formData.get("compressionLevel").toString()) : 5,
        PREVIEW_BLOCK_LIMIT: 500, // Usar preview do HoloPrint original
        SHOW_PREVIEW_SKYBOX: true, 
        CONTROLS: Object.fromEntries([...formData].filter(([key]) => key.startsWith("control.")).map(([key, value]) => [key.replace(/^control./, ""), JSON.parse(value.toString())])),
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
	const previewContainerForHoloPrint = selectEl("#texturePreviewImageCont"); // Onde o preview do HoloPrint será renderizado

	if(ACTUAL_CONSOLE_LOG) {
		pack = await HoloPrint.makePack(files, config, resourcePackStack, previewContainerForHoloPrint);
	} else {
		try {
			pack = await HoloPrint.makePack(files, config, resourcePackStack, previewContainerForHoloPrint);
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
			if (infoButton.parentNode) { // Checar se infoButton ainda está no DOM
                infoButton.parentNode.replaceChild(bugReportAnchor, infoButton);
            } else {
                completedPacksCont.prepend(bugReportAnchor); // Adicionar se o infoButton foi removido
            }
		} else {
			infoButton.classList.add("failed");
			infoButton.dataset.translate = "pack_generation_failed";
		}
	}
    await translatePage(languageSelector.value);
	if (generatePackFormSubmitButton) generatePackFormSubmitButton.disabled = false;
}
