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


// ===============================
// Fixed joint (r2_f)
// ===============================
void joint_r2_f(transform3 T)
{
    real R = 0.35;
    real H = 0.5;

    pen surfacepen = gray(0.85);
    pen edgepen = black + linewidth(0.5mm);

    triple axis = unit(T*Z - T*O);

    revolution r = cylinder(T*(-0.5*H*Z), R, H, axis);

    draw(surface(r), surfacepen);

    // top cap (filled)
    draw(surface(circle(T*(0,0, H/2), R, axis)), surfacepen);
    draw(circle(T*(0,0, H/2), R, axis), edgepen);
    // bottom cap (filled)
    draw(surface(circle(T*(0,0,-H/2), R, axis)), surfacepen);
    draw(circle(T*(0,0,-H/2), R, axis), edgepen);

    // axis
    // draw(T*O -- T*(0.5*Z), blue+linewidth(1.2), Arrow3);

}



// ===============================
// Moving link (r2_m)
// ===============================
transform3 joint_r2_m(transform3 T, real angle)
{
    pen movepen = lightgreen;
    pen edgepen = black + linewidth(0.5mm);

    // 1. rotation around local Z
    transform3 R = rotate(angle, Z);
    transform3 Tm = T * R;

    // 2. geometry
    // slimmer and longer box
    surface box =
        shift(-0.2*(X+Y) - 0.3*Z) *   // center it nicely
        scale(0.4, 0.4, 0.6) *       // thin in XY, long in Z
        unitcube;

    draw(Tm*box, movepen);

    // structural outline
    path3 p1 =
        (0,0,0.3)--(0,0,0.35)--(0.4,0,0.35)--
        (0.4,0,-0.35)--(0,0,-0.35)--(0,0,-0.3);

    draw(Tm*p1, edgepen);

    // extension link
    // draw(Tm*O -- Tm*(2.5,0,0), linewidth(2));

    // marker (rotation cue)
    dot(Tm*(0.2,0,0.3), red);
    dot(Tm*(0.2,0,-0.3), red);

    // 3. construct new frame
    // reassign frame
    transform3 Tnew = Tm * rotate(90, Y);
    
    // move the origin outside
    transform3 Tnew1 = Tnew * shift(0, 0, 0.4);

    return Tnew1;
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
joint_r2_f(identity(4));
attach_coordinates(identity(4), length=2);

// ===============================
// 3. The Animation Logic (JavaScript)
// ===============================
javascript("
window.J1_Rotate = function(p, t) {
    // Phase: t goes from 0 to 1
    let angle = 2 * Math.PI * t; // Full 360 degree rotation
    let cosA = Math.cos(angle);
    let sinA = Math.sin(angle);

    // Standard Z-axis Rotation Matrix (Column-Major)
    let M = [
        cosA,  sinA, 0, 0,
        -sinA, cosA, 0, 0,
        0,     0,    1, 0,
        0,     0,    0, 1
    ];

    // Apply matrix to point p
    return [
        M[0]*p[0] + M[4]*p[1] + M[8]*p[2]  + M[12],
        M[1]*p[0] + M[5]*p[1] + M[9]*p[2]  + M[13],
        M[2]*p[0] + M[6]*p[1] + M[10]*p[2] + M[14]
    ];
};
");

// ===============================
// 4. Apply the Transformation
// ===============================
// Everything inside this block is passed to the JS function 'J1_Rotate'
beginTransform(geometry="function(x,t){ return J1_Rotate(x,t); }", 10);
    transform3 Tnew = joint_r2_m(identity(4), 0);

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
    title.innerHTML = '<b>Revolute Joint type r1</b>';

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