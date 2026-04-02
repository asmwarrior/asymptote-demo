import three;
import solids;

settings.outformat="html";
settings.render=4;
settings.autobillboard=false;

size(6cm);



currentprojection=  perspective(
camera=(6.665502904971909,-3.585280577119727,6.08389450631703),
up=(-0.0045653266601215605,0.004314751057124451,0.008348808208740604),
target=(1.1949250588004992,0.8138961358831001,0.8189144709984002));


//---------------------------------------------------
// Draw coordinate frame
//---------------------------------------------------
void drawFrame(transform3 T=identity4, string name="", pen p=currentpen)
{
    triple O=T*O;
    triple X=T*(1,0,0);
    triple Y=T*(0,1,0);
    triple Z=T*(0,0,1);

    draw(O--X, p+red+1.5bp, Arrow3(5));
    draw(O--Y, p+green+1.5bp, Arrow3(5));
    draw(O--Z, p+blue+1.5bp, Arrow3(5));

    if(name!="")
        dot(Label("$O_{"+name+"}$"), O);
}

//---------------------------------------------------
// Define target frame T1
//---------------------------------------------------
transform3 T1 =
    shift((2,1,1))
  * rotate(60, (0,0,1))
  * rotate(30, (0,1,0));

//---------------------------------------------------
// Draw static frames
//---------------------------------------------------
drawFrame(identity4,"0");   // fixed frame
drawFrame(T1,"1");          // target frame



//---------------------------------------------------
// Static point P and vectors
//---------------------------------------------------

// Define point P (you can change this)
triple P = (-0.5, 1, 1.8);

// Origins of frames
triple O0 = identity4 * O;
triple O1 = T1 * O;

// Draw point P
dot(Label("$P$", align=NE), P, black);

// Draw vectors
draw(Label("$\overrightarrow{O_0P}$",0.5),
     O0 -- P, orange+1.2bp, Arrow3(6));

draw(Label("$\overrightarrow{O_1P}$",0.5),
     O1 -- P, purple+1.2bp, Arrow3(6));

draw(Label("$\overrightarrow{O_0O_1}$",0.5),
     O0 -- O1, heavycyan+1.2bp, Arrow3(6));


//---------------------------------------------------
// Export T1 to JavaScript
//---------------------------------------------------
javascript("
let T1 = [
"+string(T1[0][0])+","+string(T1[0][1])+","+string(T1[0][2])+","+string(T1[0][3])+",
"+string(T1[1][0])+","+string(T1[1][1])+","+string(T1[1][2])+","+string(T1[1][3])+",
"+string(T1[2][0])+","+string(T1[2][1])+","+string(T1[2][2])+","+string(T1[2][3])+"
];

// translation
let t1 = [T1[3], T1[7], T1[11]];

// rotation
let R1 = [
    T1[0],T1[1],T1[2],
    T1[4],T1[5],T1[6],
    T1[8],T1[9],T1[10]
];

// Rodrigues interpolation
function rotInterp(R, t){
    let trace = R[0]+R[4]+R[8];
    let theta = Math.acos(Math.max(-1,Math.min(1,(trace-1)/2)));

    if(theta < 1e-6){
        return [1,0,0, 0,1,0, 0,0,1];
    }

    let kx = (R[7]-R[5])/(2*Math.sin(theta));
    let ky = (R[2]-R[6])/(2*Math.sin(theta));
    let kz = (R[3]-R[1])/(2*Math.sin(theta));

    let angle = theta * t;
    let c=Math.cos(angle), s=Math.sin(angle), v=1-c;

    return [
        kx*kx*v+c,     kx*ky*v-kz*s, kx*kz*v+ky*s,
        ky*kx*v+kz*s,  ky*ky*v+c,    ky*kz*v-kx*s,
        kz*kx*v-ky*s,  kz*ky*v+kx*s, kz*kz*v+c
    ];
}

// apply R*x + t
function applyRT(x, R, t){
    return [
        R[0]*x[0]+R[1]*x[1]+R[2]*x[2]+t[0],
        R[3]*x[0]+R[4]*x[1]+R[5]*x[2]+t[1],
        R[6]*x[0]+R[7]*x[1]+R[8]*x[2]+t[2]
    ];
}
");

//---------------------------------------------------
// Animated frame: rotate first, then translate
//---------------------------------------------------
beginTransform(geometry="
function(x,time){

    let t = Math.min(time,1.0);

    let R, trans;

    if(t < 0.5){
        // Phase 1: rotation
        let tau = t / 0.5;
        R = rotInterp(R1, tau);
        trans = [0,0,0];

    } else {
        // Phase 2: translation
        let tau = (t - 0.5) / 0.5;
        R = R1;
        trans = [tau*t1[0], tau*t1[1], tau*t1[2]];
    }

    return applyRT(x, R, trans);
}
",8);

    drawFrame(identity4, "", dashed);  // draw the moving animation frame in dashed mode

endTransform();

//---------------------------------------------------
// Slider styling + auto play
//---------------------------------------------------
javascript("
let style=document.createElement('style');
style.textContent='.slider { width:80% !important; left:10% !important; bottom:20px; }';
document.head.appendChild(style);

// auto press 'b' to play
window.addEventListener('load',function(){
    setTimeout(function(){
        document.dispatchEvent(new KeyboardEvent('keydown',{
            key:'b',
            code:'KeyB',
            keyCode:66,
            which:66,
            bubbles:true
        }));
    },500);
});
");