'use strict';
/** 
 * @author github.com/tintinweb
 * @license MIT
 * 
 * 
 * */

/** imports */
const vscode = require("vscode");
const { DecompileCtrl } = require('./features/decompile');

const tmp = require('tmp');
const fs = require('fs');
const path = require('path');

function vscodeShowSingleFile(options, where) {
    return vscode.workspace.openTextDocument(options).then(doc => {
        return vscode.window.showTextDocument(doc, where || vscode.ViewColumn.Active);
    });
}

/** event funcs */
function onActivate(context) {
    const decompileCtrl = new DecompileCtrl();

    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider(
            'decompileFs',
            decompileCtrl.memFs,
            {
                isCaseSensitive: true,
                isReadonly: false
            }
        )
    );


    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(e => {
        })
    );


    context.subscriptions.push(
        vscode.commands.registerCommand(
            'vscode-decompiler.decompile', async (uriItem, multiSelectUriItems) => {
                multiSelectUriItems = multiSelectUriItems || [uriItem]; /* multiSelectUri contains uriItem if set */

                if (!vscode.workspace.getWorkspaceFolder(vscode.Uri.parse("decompileFs:/"))) {
                    console.log("isNotInitialized");
                    context.workspaceState.update("vscodeDecompiler.pendingUri", JSON.stringify({ ts: Date.now(), items: multiSelectUriItems })).then(() => {
                        console.log("wait for reload...");
                        decompileCtrl.reveal();
                    });
                    return;
                }

                multiSelectUriItems.forEach(async uri => {
                    decompileCtrl.showDecompileWithProgress(uri).then(ret => {
                        if (ret.type == "single") {
                            vscodeShowSingleFile(vscode.Uri.parse(ret.memFsPath))
                                .then(
                                    result => { },
                                    error => {
                                        vscodeShowSingleFile({ content: ret.data, language: ret.language });  //if this fails, show directly as new file
                                    })
                                .catch(() => {
                                    vscodeShowSingleFile({ content: ret.data, language: ret.language });  //if this fails, show directly as new file
                                });

                        } else if (ret.type == "multi") {
                            decompileCtrl.reveal(); //reveal memfs with contents
                        } else {
                            vscode.window.showErrorMessage("Failed to decompile file :/");
                        }
                    },
                        error => {
                            vscode.window.showErrorMessage(`Failed to run decompiliation command. Check your configuration. ${JSON.stringify(error)}`);
                            if(vscode.window.outputChannel) {
                                vscode.window.outputChannel.show();
                            }
                        });

                });
            })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'vscode-decompiler.decompileShowContent', async (filename, content) => {
                if(!filename || filename.includes("/") || filename.includes("\\") || !content){
                    throw "Invalid Filename. Please provide a filename not a Path";
                }
            
                tmp.dir({unsafeCleanup: true}, (err, projectPath, cleanupCallback) => {
                    if (err) throw err;

                    let targetPath = path.join(projectPath, filename);
                    fs.writeFile(targetPath, content, (err) => {
                        if (err) throw err;
                        vscode.commands.executeCommand("vscode-decompiler.decompile", vscode.Uri.file(targetPath));
                        cleanupCallback();
                    });
                });
            })
    );

    try {
        // let's make sure we do not bail if the workspacestate is corrupt. Just ignore it in this case.
        const pendingUrisMemento = JSON.parse(context.workspaceState.get("vscodeDecompiler.pendingUri", "{}") || "{}");
        if (pendingUrisMemento && pendingUrisMemento.ts && pendingUrisMemento.items.length) {
            context.workspaceState.update("vscodeDecompiler.pendingUri", "{}").then(() => {
                if (Date.now() - pendingUrisMemento.ts <= 30 * 1000) {
                    // 30sec grace period. ignore all other pendingUris
                    console.log("restarting decompile for: " + pendingUrisMemento.items);
                    vscode.commands.executeCommand("vscode-decompiler.decompile", undefined, pendingUrisMemento.items.map(u => new vscode.Uri(u)));
                }
            });
        }
    } catch (err) {
        console.warn(err);
    }
}

/* exports */
exports.activate = onActivate;