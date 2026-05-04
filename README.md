

# Asymptote WebGL Demos

This repository contains interactive 3D visualizations and robot kinematics WebGL pages created with the [Asymptote](https://asymptote.sourceforge.io/right.html) vector graphics language.

## Live Access
The interactive demos are hosted at:  
[https://asmwarrior.github.io/asymptote-demo/](https://asmwarrior.github.io/asymptote-demo/)

## Overview
These WebGL pages demonstrate many robot arm kinematics using Asymptote's WebGL export capabilities. Each demo includes:
*   Real-time joint control via JavaScript sliders.
*   Dynamic coordinate frame transformations.
*   Hardware-accelerated 3D rendering.
*   Time based animations.

## Repository Contents
*   **Source Files (.asy):** Asymptote code defining the geometry, kinematics logic, and JavaScript bridge.
*   **Exported Files (.html):** Standalone WebGL files for browser viewing.
*   **Engine (`gl.js`):** The core WebGL rendering script for Asymptote. 
Note that the `gl.js` is generated from my fork of the Asymptote git repository: asmwarrior/asymptote: 2D & 3D TeX-Aware Vector Graphics Language — https://github.com/asmwarrior/asymptote

To build the new js file, you need to run the command `npm run build --prefix webgl`(I'm running this command under msys2/mingw64 shell), if the debug version of the js file is needed, you can run
`npm run build-dev --prefix webgl` which doesn't have the optimized/mangled javascript code.

## Building from Source
To generate the HTML files from the source, use the Asymptote compiler:

```bash
asy -f html -V filename.asy
```

I'm using the Notepad++'s NppExec plugin to run the compiling command, the `Follow $(CURRENT_DIRECTORY)` option should be checked for this plugin's option.

```
C:\Program Files\Asymptote\asy.exe --keep $(NAME_PART).asy -f html -v -V
cmd /c ""C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -Command "$f='$(NAME_PART).html'; $c=Get-Content $f -Raw; $c=[regex]::Replace($c,'https://vectorgraphics\.github\.io/asymptote/base/webgl/asygl-[0-9.]+\.js','gl.js',1); Set-Content $f $c""
```

Note the second command line is to replace the js file path in the generated html by my own 'gl.js`.