import graph3;
import solids;

// Output settings for interactive HTML
settings.outformat="html";
settings.render=4;

size(10cm);
currentprojection=perspective(camera=(5,5,3), target=(0,0,0));

currentlight = light(
    background=white,
    // Three diffuse pens for three positions
    diffuse=new pen[] {gray(0.8), gray(0.8), gray(0.7)},
    // Three specular pens for three positions
    specular=new pen[] {gray(0.1), gray(0.1), gray(0.1)},
    // Three positions: Camera, Fill-left, Top-down
    position=new triple[] {currentprojection.camera, (-5,-5,5), (0,0,10)}
);



void joint_p_f(transform3 T)
{
    pen edgepen = black + linewidth(0.5);
    pen surfacepen = lightblue;

    // define SAME base cube
    surface box = unitcube;
    path3[] edges = box((0,0,0),(1,1,1));

    // SAME transform chain
    transform3 S = shift(-0.2*(X+Y)-0.3*Z) * scale(0.4, 0.4, 0.6);

    draw(T*(S*box), surfacepen);

    for(path3 e : S*edges)
        draw(T*e, edgepen);
}

transform3 joint_p_m(transform3 T, real d)
{
    pen edgepen = black + linewidth(0.5);
    pen surfacepen = lightgreen;

    transform3 Tm = T * shift(d*Z);

    // base cube
    surface box = unitcube;
    path3[] edges = box((0,0,0),(1,1,1));

    transform3 S = shift(-0.175*(X+Y)-0.3*Z) * scale(0.35, 0.35, 0.6);

    draw(Tm*(S*box), surfacepen);

    for(path3 e : S*edges)
        draw(Tm*e, edgepen);

    // draw(Tm*O -- Tm*(1.5*Z), dashed+blue);

    // FIX: Apply S to the dot position so it moves with the box
    // Using (1,1,1) puts it on the outer corner of the unitcube
    dot(Tm*S*(1,1,1), red);

    return Tm;
}

void attach_coordinates(transform3 T, real length=2)
{
    // axes
    draw(T*scale3(length)*(O--X), red, Arrow3(size=10));
    draw(T*scale3(length)*(O--Y), green, Arrow3(size=10));
    draw(T*scale3(length)*(O--Z), blue, Arrow3(size=10));

    // label positions (apply SAME transform!)
    triple px = T*scale3(length)*(1.2*X);
    triple py = T*scale3(length)*(1.2*Y);
    triple pz = T*scale3(length)*(1.2*Z);

    // 使用变换后的坐标轴方向作为对齐方向
    label("$x$", px, T*X, red);
    label("$y$", py, T*Y, green);
    label("$z$", pz, T*Z, blue);
}

// Draw the static base at the world origin
joint_p_f(identity(4));
attach_coordinates(identity(4), length=2);

// ===============================
// 3. The Animation Logic (JavaScript)
// ===============================
javascript("
window.J1_Translate = function(p, t) {
    let dz = 0.3 * t;   // 沿 Z 轴移动 0 → 0.3

    return [
        p[0],
        p[1],
        p[2] + dz
    ];
};
");

// ===============================
// 4. Apply the Transformation
// ===============================
// Everything inside this block is passed to the JS function 'J1_Rotate'
beginTransform(geometry="function(x,t){ return J1_Translate(x,t); }", 10);
    transform3 Tnew = joint_p_m(identity(4), 0);

    attach_coordinates(Tnew, length=1.5);
    
endTransform();



//---------------------------------------------------
// Responsive UI with Auto-Loop Trigger
//---------------------------------------------------
javascript("
let style = document.createElement('style');
style.textContent = `
  /* 1. Direct target of the slider element */
  .slider {
    -webkit-appearance: none;
    width: 80% !important;
    left: 10% !important;
    bottom: 5vh !important;    /* Positioned relative to viewport height */
    height: 6vh !important;    /* Control area size for touch input */
    background: transparent !important;
    cursor: pointer;
    position: absolute;
    z-index: 1000;
  }

  /* 2. Responsive Track */
  .slider::-webkit-slider-runnable-track {
    width: 100%;
    height: 1.5vh !important;
    background: #ddd !important;
    border-radius: 0.75vh;
    border: 1px solid #bbb;
  }

  /* 3. Responsive Thumb (Knob) */
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 4.5vh !important;
    width: 4.5vh !important;
    border-radius: 50%;
    background: #4CAF50 !important;
    /* Vertical centering: (1.5vh / 2) - (4.5vh / 2) = -1.5vh */
    margin-top: -1.5vh !important;
    box-shadow: 0 0.5vh 1vh rgba(0,0,0,0.3);
    border: 0.3vh solid white;
  }

  /* Firefox Compatibility */
  .slider::-moz-range-track { height: 1.5vh; border-radius: 0.75vh; background: #ddd; }
  .slider::-moz-range-thumb { height: 4.5vh; width: 4.5vh; background: #4CAF50; border-radius: 50%; border: 0.3vh solid white; }
`;
document.head.appendChild(style);

// 4. Auto-play Logic
window.addEventListener('load', function(){
    setTimeout(function(){
        // Dispatches the 'b' key event to toggle the Loop mode in Asymptote's WebGL player
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'b',
            code: 'KeyB',
            keyCode: 66,
            which: 66,
            bubbles: true
        }));
    }, 500); // 500ms delay to ensure the player is ready

    // ----------------------
    // Title (Top Center)
    // ----------------------
    let title = document.createElement('div');
    title.innerHTML = '<b>Prismatic Joint</b>';

    title.style.position = 'absolute';
    title.style.top = '10px';
    title.style.left = '50%';
    title.style.transform = 'translateX(-50%)';

    title.style.fontSize = '20px';
    title.style.fontFamily = 'Arial, sans-serif';
    title.style.color = 'black';
    title.style.zIndex = '2000';
    title.style.pointerEvents = 'none';

    document.body.appendChild(title);

    // ----------------------
    // Footer (Bottom Right)
    // ----------------------
    let credit = document.createElement('div');
    credit.innerHTML = 'Powered by <tt>Asymptote</tt> & <tt>WebGL</tt>';

    credit.style.position = 'absolute';
    credit.style.bottom = '10px';
    credit.style.right = '15px';

    credit.style.fontSize = '12px';
    credit.style.fontFamily = 'Arial, sans-serif';
    credit.style.color = 'darkblue';
    credit.style.zIndex = '2000';
    credit.style.pointerEvents = 'none';

    document.body.appendChild(credit);

});
");