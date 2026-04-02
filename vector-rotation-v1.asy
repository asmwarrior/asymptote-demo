import three;
import solids;

settings.outformat="html";
settings.render=4;
settings.autobillboard=false;

size(6cm);

currentprojection=perspective(
camera=(6.6655,-3.5853,6.0839),
up=(-0.0046,0.0043,0.0083),
target=(1.1949,0.8139,0.8189));

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
// Define transform T1
//---------------------------------------------------
transform3 T1 =
    shift((2,1,1))
  * rotate(60,(0,0,1))
  * rotate(30,(0,1,0));

//---------------------------------------------------
// Static world frame
//---------------------------------------------------
drawFrame(identity4,"0");

//---------------------------------------------------
// Local point
//---------------------------------------------------
triple Plocal = (-0.5, 1, 1.8);

//---------------------------------------------------
// === 静态最终状态（关键新增） ===
//---------------------------------------------------

// O1 origin
triple O1 = T1 * O;

// 最终 P（world 坐标）
triple Pfinal = T1 * Plocal;

// 1️⃣ 画最终坐标系 O1
drawFrame(T1,"1");

// 2️⃣ 向量 O0 → O1
draw(Label("$\overrightarrow{O_0O_1}$",0.5),
     O -- O1, heavycyan+1.2bp, Arrow3(6));

// 3️⃣ 向量 O1 → Pfinal
draw(Label("$\overrightarrow{O_1P}$",0.5),
     O1 -- Pfinal, purple+1.2bp, Arrow3(6));

// 4️⃣ 向量 O0 → Pfinal
draw(Label("$\overrightarrow{O_0P}$",0.5),
     O -- Pfinal, orange+1.2bp, Arrow3(6));

// 画最终点 P
dot(Label("$P$", align=NE), Pfinal, black);

//---------------------------------------------------
// Export transform to JS
//---------------------------------------------------
javascript("
let T1 = [
"+string(T1[0][0])+","+string(T1[0][1])+","+string(T1[0][2])+","+string(T1[0][3])+",
"+string(T1[1][0])+","+string(T1[1][1])+","+string(T1[1][2])+","+string(T1[1][3])+",
"+string(T1[2][0])+","+string(T1[2][1])+","+string(T1[2][2])+","+string(T1[2][3])+"
];

let t1 = [T1[3], T1[7], T1[11]];

let R1 = [
    T1[0],T1[1],T1[2],
    T1[4],T1[5],T1[6],
    T1[8],T1[9],T1[10]
];

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

function applyRT(x, R, t){
    return [
        R[0]*x[0]+R[1]*x[1]+R[2]*x[2]+t[0],
        R[3]*x[0]+R[4]*x[1]+R[5]*x[2]+t[1],
        R[6]*x[0]+R[7]*x[1]+R[8]*x[2]+t[2]
    ];
}
");

//---------------------------------------------------
// Animation
//---------------------------------------------------
beginTransform(geometry="
function(x,time){

    let t = Math.min(time,1.0);

    let R, trans;

    if(t < 0.5){
        let tau = t / 0.5;
        R = rotInterp(R1, tau);
        trans = [0,0,0];
    } else {
        let tau = (t - 0.5) / 0.5;
        R = R1;
        trans = [tau*t1[0], tau*t1[1], tau*t1[2]];
    }

    return applyRT(x, R, trans);
}
",8);

    // moving frame
    drawFrame(identity4, "", dashed);

    // moving point
    dot(Plocal);

    // moving vector OP
    draw(O -- Plocal, purple+1.2bp, Arrow3(6));

endTransform();

//---------------------------------------------------
// UI
//---------------------------------------------------
javascript("
let style=document.createElement('style');
style.textContent='.slider { width:80% !important; left:10% !important; bottom:20px; }';
document.head.appendChild(style);

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