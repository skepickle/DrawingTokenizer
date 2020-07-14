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
			return "worlds/" + game.world.name;
		}

		static getUploadPath(){
			return "worlds/" + game.world.name + "/DrawingTokenizerData";
		}

		/**
		 * Convert the selected drawings to an png image
		 */
		static convertDrawing(filename, drawings) {
			const savedGridType = game.scenes.active.data.gridType;
			// Hook into canvasReady so the image can be exported after the grid has been deactivated
			Hooks.once('canvasReady', () => {
				// Loop through all selected drawings and find the top left corner and bottom right corner
				let topleft = {x:0,y:0}
				let bottomright = {x:0,y:0}
				let first = true;
				for (const key in drawings) {
					if (drawings.hasOwnProperty(key)) {
						const drawing = drawings[key];
						if (first){
							first = false;
							topleft.x = drawing.data.x;
							topleft.y = drawing.data.y;
							bottomright.x = drawing.data.x + drawing.data.width;
							bottomright.y = drawing.data.y + drawing.data.height;
						}
						else{
							if(topleft.x > drawing.data.x) topleft.x = drawing.data.x;
							if(topleft.y > drawing.data.y) topleft.y = drawing.data.y;
							if(bottomright.x < drawing.data.x + drawing.data.width) bottomright.x = drawing.data.x + drawing.data.width;
							if(bottomright.y < drawing.data.y + drawing.data.height) bottomright.y = drawing.data.y + drawing.data.height;
						}
					}
				}
				canvas.activeLayer.releaseAll();
				DrawingTokenizer.convertToBlobAndUpload(canvas.app, topleft, bottomright, filename + ".png");
				
				//Reactivate the grid	
				game.scenes.active.update({gridType: savedGridType});
			});
			//Deactivate the grid
			game.scenes.active.update({gridType:CONST.GRID_TYPES.GRIDLESS});
		}

		/**
		 * Render and crop canvas and upload image to foundry
		 */
		static convertToBlobAndUpload(app, topleft, bottomright, fileName) {
			app.render();
			var DTcanvas = app.renderer.extract.canvas();
			var croppedCanvas = DrawingTokenizer.cropCanvas(DTcanvas, topleft, bottomright);

			DrawingTokenizer.uploadToFoundry(DrawingTokenizer.getCanvasBlob(croppedCanvas), fileName).then();
		}

		/**
		 * Crop the image via a temporary canvas
		 */
		static cropCanvas(sourceCanvas, topleft, bottomright){
			let tmpcanvas = document.createElement("canvas");
			let context = tmpcanvas.getContext("2d");
			tmpcanvas.width = bottomright.x - topleft.x;
			tmpcanvas.height = bottomright.y - topleft.y;
			let xoffset = canvas.stage.pivot._x-(canvas.app.view.width/2);
			let yoffset = canvas.stage.pivot._y-(canvas.app.view.height/2);
			context.drawImage(sourceCanvas, xoffset-topleft.x, yoffset-topleft.y);
			return tmpcanvas;
		}

		/**
		 * Convert canvas to Blob
		 */
		static getCanvasBlob(canvas) {
			return new Promise(function(resolve, reject) {
			  canvas.toBlob(function(blob) {
				resolve(blob)
			  })
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

	window.KLG = window.KLG || {};
	Hooks.on('getSceneControlButtons', (controls) => DrawingTokenizer._getControlButtons(controls));
	Hooks.once('canvasReady', () => DrawingTokenizer.initialize());
})();
