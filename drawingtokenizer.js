(async () => {
	class DrawingTokenizer {
		static initialize(){
			(async () => {
				DrawingTokenizer.createUploadDirectory();
			})().catch(e => {
				console.log("DrawingTokenizer | " + e.message);
			});
		}

		static getWorldPath(){
			return "worlds/" + game.world.data.name;
		}

		static getUploadPath(){
			return "worlds/" + game.world.data.name + "/DrawingTokenizerData";
		}

		/**
		 * Convert the selected drawings to an png image
		 */
		static async convertDrawing(filename, drawings) {
			let container = new PIXI.Container();
			const savedGridVisibility = canvas.grid.visible;

			//Deactivate the grid
			canvas.grid.visible = false;

			let mydrawings = canvas.drawings.controlled;	
			canvas.drawings.releaseAll();
			//Copy all drawings into a PIXI Container
			for (let i = 0; i < mydrawings.length; i++) {
				container.addChild(mydrawings[i].clone());
				await container.children[i].draw();
			}
			await DrawingTokenizer.convertContainerToBlobAndUpload(container, filename + ".png");
			
			//Reactivate the grid	
			canvas.grid.visible = savedGridVisibility;
		}

		static async convertContainerToBlobAndUpload(container, fileName) {
			return DrawingTokenizer.uploadToFoundry(DrawingTokenizer.getContainerBlob(container), fileName);
		}

		/**
		 * Convert canvas to Blob
		 */
		static getContainerBlob(container) {
			return new Promise(function(resolve, reject) {
				console.log(canvas.app.renderer.extract.image(container).src);
				fetch(canvas.app.renderer.extract.image(container).src)
				.then(res => res.blob())
				.then(blob => {
					resolve(blob);
				});
			})
		  }

		/**
		 * Upload blob to foundry
		 */
		static async uploadToFoundry(data, filename) {
			// Create the form data to post
			const fd = new FormData();
			const path = DrawingTokenizer.getUploadPath();
			let test = await data;
			fd.set("source", 'data');
			fd.set("target", path);
			fd.set("upload", test, filename);
		
			// Dispatch the request
			const request = await fetch('/upload', {method: "POST", body: fd});
			if ( request.status === 413 ) {
				return ui.notifications.error(game.i18n.localize("FILES.ErrorTooLarge"));
			} else if ( request.status !== 200 ) {
				return ui.notifications.error(game.i18n.localize("FILES.ErrorSomethingWrong"));
			}
		
			// Retrieve the server response
			const response = await request.json();
			if (response.error) {
				ui.notifications.error(response.error);
				return false;
			} else if (response.message) {
				if ( /^(modules|systems)/.test(response.path) ) {
					ui.notifications.warn(game.i18n.localize("FILES.WarnUploadModules"))
				}
				ui.notifications.info(response.message);
			}
			return response;
		  }

		/**
		 * Create the default Upload directory
		 */
		static async createUploadDirectory(){
			const options={};
			const source="data";
			let target=DrawingTokenizer.getWorldPath();

			let data = {action: "browseFiles", storage: source, target: target};
			let files = await FilePicker._manageFiles(data, options);
			let DirExists=false;
			target=DrawingTokenizer.getUploadPath();
			files.dirs.forEach(dir => {
				DirExists= DirExists || dir===target;
			});
			if(!DirExists){
				data = {action: "createDirectory", storage: source, target: target};
				await FilePicker._manageFiles(data, options);
			}
		}
		
		/**
		 * Hook into the Drawing toolbar and add a button for conversion of drawings
		 */
		static _getControlButtons(controls){
			for (let i = 0; i < controls.length; i++) {
				if(controls[i].name === "drawings"){
					controls[i].tools.push({
						name: "DTtoImage",
						title: game.i18n.localize("DRAWINGTOKENIZER.ConvertToImage"),
						icon: "fas fa-image",
						visible: game.user.isGM,
						onClick: () => DrawingTokenizer._convertDrawingDialog(),
						button: true
					  });
				};
				
			}
			console.log("DrawingTokenizer | Tool added.");
		}

		/**
		 * Present the user with a dialog to convert a drawing to an image.
		 */
		static _convertDrawingDialog() {
			if(Object.keys(canvas.drawings._controlled).length <= 0) return ui.notifications.error(game.i18n.localize("DRAWINGTOKENIZER.error.NoDrawingsSelected"));
			const selectedDrawings = canvas.drawings._controlled;
			
			const form = `<form><div class="form-group">
			<label>Image filename</label>
			<input type="text" name="filename" placeholder="drawing-name" required/>
			</div></form>`;
			return Dialog.confirm({
			title: "Convert drawing to image",
			content: form,
			yes: html => {
				const filename = html.find("input")[0].value;
				if(filename.trim().length == 0) return ui.notifications.error(game.i18n.localize("DRAWINGTOKENIZER.error.NoFilenameEntered"));

				DrawingTokenizer.convertDrawing(filename, selectedDrawings);
			}
			})
		}
	}
	Hooks.on('getSceneControlButtons', (controls) => DrawingTokenizer._getControlButtons(controls));
	Hooks.once('canvasReady', () => DrawingTokenizer.initialize());
})();
