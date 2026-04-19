import graph3;
import solids;

settings.outformat="html";
settings.render=4;

size(10cm);
currentprojection=perspective(camera=(6,6,4), target=(0,0,0));


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
// Parameters
// ===============================
real L1_Len = 2;
real L2_Len = 1.2;
real L3_Len = 0.7;




// ===============================
// Fixed part (base)
// ===============================
void joint_r1_f(transform3 T)
{
    real R = 0.35;
    real H = 0.5;   // shorter than before

    pen surfacepen = lightgray;
    pen edgepen = black + linewidth(0.5mm);

    triple axis = unit(T*Z - T*O);

    revolution r = cylinder(T*(-0.5*H*Z), R, H, T*Z - T*O);
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
// Moving part (hub + link root)
// ===============================
transform3 joint_r1_m(transform3 T, real angle)
{

    // apply rotation
    transform3 R = rotate(angle, Z);
    transform3 Tm = T * R;
    pen movepen = lightblue;

    // slimmer and longer box
    surface box =
        shift(-0.2*(X+Y) - 0.3*Z) *   // center it nicely
        scale(0.4, 0.4, 0.6) *        // thin in XY, long in Z
        unitcube;

    draw(Tm*box, movepen);

    // link (optional extension)
    // draw(Tm*(0,0,1.2) -- Tm*(0,0,2.5), linewidth(2));

    // small marker (helps visualize rotation)
    dot(Tm*(0.2,0,0.3), red);
    dot(Tm*(0.2,0,-0.3), red);

    return Tm;
}

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

    return Tnew;
}



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

void draw_gripper_simple(transform3 T)
{
    pen p = black + linewidth(1.2);

    real w = 0.1;   // half width
    real h = 0.2;   // finger length

    triple left_base  = (-w, 0, 0);
    triple right_base = ( w, 0, 0);

    triple left_tip  = (-w, 0, h);
    triple right_tip = ( w, 0, h);

    // two fingers
    draw(T*left_base -- T*left_tip, p);
    draw(T*right_base -- T*right_tip, p);

    // bottom connection
    draw(T*left_base -- T*right_base, p);
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

javascript("
// Standard Column-Major Matrix Multiply: C = A * B
function multiply(A, B) {
    let C = new Array(16).fill(0);
    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) {
                sum += A[row + k*4] * B[k + col*4];
            }
            C[row + col*4] = sum;
        }
    }
    return C;
}

// Apply Matrix to Point
function apply(M, p) {
    let x = p[0], y = p[1], z = p[2];
    return [
        M[0]*x + M[4]*y + M[8]*z  + M[12],
        M[1]*x + M[5]*y + M[9]*z  + M[13],
        M[2]*x + M[6]*y + M[10]*z + M[14]
    ];
}

// helper: clamp between 0 and 1
function clamp(x) {
    return Math.max(0, Math.min(1, x));
}

// helper: remap interval
function phase(t, t0, t1) {
    return clamp((t - t0) / (t1 - t0));
}


// Dynamic Joint 1
window.J1 = function(p, t) {

    let t1 = phase(t, 0.0, 0.33);  // only active in first third

    let angle = 120 * t1 * Math.PI/180;   // reduced from 90 → 120
    let cosA = Math.cos(angle), sinA = Math.sin(angle);

    // Dynamic Rotation Matrix for Joint 1 (Z-axis)
    let J1_MOTION = [
        cosA, sinA, 0, 0,
       -sinA, cosA, 0, 0,
        0,    0,    1, 0,
        0,    0,    0, 1
    ];

    // Combine: Total = Motion * Static Link Offset
    let T_final = multiply(window.L0_OFFSET, J1_MOTION);
    return apply(T_final, p);
};

// Dynamic Joint 2
window.J2 = function(p, t) {
    let t2 = phase(t, 0.33, 0.66);  // second phase only

    let angle = 45 * t2 * Math.PI/180;  // reduced angle
    let cosA = Math.cos(angle), sinA = Math.sin(angle);

    // Dynamic Rotation Matrix for Joint 2 (Z-axis)
    let J2_MOTION = [
        cosA, sinA, 0, 0,
       -sinA, cosA, 0, 0,
        0,    0,    1, 0,
        0,    0,    0, 1
    ];

    // Combine: Total = Motion * Static Link Offset
    let T_final = multiply(window.L1_OFFSET, J2_MOTION);
    return apply(T_final, p);
};

window.J3 = function(p, t) {
    // 1. Calculate dynamic displacement
    let t3 = phase(t, 0.66, 1.0);  // final phase

    let d = 0.4 * t3;   // reduced from 1.0 → 0.4

    // 2. Dynamic Translation Matrix for Joint 3 (Z-axis slide)
    // In Column-Major, the translation vector is at indices 12, 13, 14.
    let J3_MOTION = [
        1, 0, 0, 0, // Column 0
        0, 1, 0, 0, // Column 1
        0, 0, 1, 0, // Column 2
        0, 0, d, 1  // Column 3: [tx, ty, tz, 1]
    ];

    // 3. Combine: Total = Motion * Static Link Offset (L3_OFFSET)
    // This places the moving prismatic part relative to the end of Link 2.
    let T_final = multiply(window.L2_OFFSET, J3_MOTION);

    return apply(T_final, p);
};

");

void exportToJS(string name, transform3 T) {
    // 1. Build the full JS command string first
    string jsCommand = "window." + name + " = [" +
        string(T[0][0]) + "," + string(T[1][0]) + "," + string(T[2][0]) + "," + string(T[3][0]) + "," +
        string(T[0][1]) + "," + string(T[1][1]) + "," + string(T[2][1]) + "," + string(T[3][1]) + "," +
        string(T[0][2]) + "," + string(T[1][2]) + "," + string(T[2][2]) + "," + string(T[3][2]) + "," +
        string(T[0][3]) + "," + string(T[1][3]) + "," + string(T[2][3]) + "," + string(T[3][3]) + "];";

    // 2. Pass the final string to the javascript command
    javascript(jsCommand);
}



// ===============================
// World frame
// ===============================
draw(O--X, red, Arrow3);
draw(O--Y, green, Arrow3);
draw(O--Z, blue, Arrow3);

// ===============================
// World frame labels with alignment
// ===============================
// "E" (East) pushes the text to the right of the point 1.1*X
label("$x$", 1.1*X, N, red);

// "N" (North) pushes the text above the point 1.1*Y
label("$y$", 1.1*Y, N, green);

// "Z" usually looks best with a "top" or "North" alignment
label("$z$", 1.0*Z, E, blue);

// Planes
pen bg=gray(0.9);
real r = 2.5;
draw(surface((r,r,0)--(-r,r,0)--(-r,-r,0)--(r,-r,0)--cycle),bg,bg,light=nolight);

transform3 I = identity(4);
// link base
transform3 L0 = identity(4);
// link before the J1, we call it L0
joint_r1_f(L0);

// J1 is a revolute joint, we will define the T_0_1 dynamically in the J1 js function
// we must save the L0
// finally, if the J1(x,t) function defined a T_0_1 matrix
// we must apply the T_0_1 * L0 to all the verteics in the below beginTransform/endTransform block

beginTransform("function(x,t){ return J1(x,t); }", 10);
    // Link 1 start here
    // we will start from the identity transform3 I
    transform3 L1_a = joint_r1_m(I, 0);

    triple p1 = L1_a*O;
    transform3 L1_b = L1_a*shift(0,0,L1_Len);
    triple p2 = L1_b*O;
    draw(p1--p2, linewidth(2));
    transform3 L1_c = L1_b * rotate(-90, X);
    joint_r2_f(L1_c);
    // we must save the L1
    // finally, if the J2(x,t) function defined a T_1_2 matrix
    // we must apply the T_1_2 * L1 to all the verteics in the below beginTransform/endTransform block
    transform3 L1 = L1_c;

    beginTransform("function(x,t){ return J2(x,t); }", 10);

        transform3 L2_a = joint_r2_m(I, -30);
        // draw the Link 2, note the radius of the rotating frame is 0.4, which is defined in the joint_r2_m
        // so we only need to start from the (0,0,0.4), not the (0,0,0)
        triple p3 = L2_a*(0,0,0.4);
        transform3 L2_b = L2_a*shift(0,0,L2_Len);
        triple p4 = L2_b*O;
        draw(p3--p4, linewidth(2));

        joint_p_f(L2_b);

        // we must save the L2
        // finally, if the J3(x,t) function defined a T_2_3 matrix
        // we must apply the T_2_3 * L2 to all the verteics in the below beginTransform/endTransform block
        transform3 L2 = L2_b;

       beginTransform("function(x,t){ return J3(x,t); }", 10);

            transform3 L3_a = joint_p_m(I, 0.1);
            triple p5 = L3_a*O;
            transform3 L3_b = L3_a*shift(0,0,L3_Len);
            triple p6 = L3_b*O;
            draw(p5--p6, linewidth(2));
            draw_gripper_simple(L3_b);
            attach_coordinates(L3_b, 0.5);
        endTransform();

    endTransform();

endTransform();

// ==========================================
// Static 2D Overlay (Title and Credits)
// ==========================================


// After you calculate your L-variables in the script:
exportToJS("L0_OFFSET", L0);
exportToJS("L1_OFFSET", L1);
exportToJS("L2_OFFSET", L2);


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
    title.innerHTML = '<b>RRP Three-Joint Robot Arm</b>';

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


