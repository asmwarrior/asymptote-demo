import solids;
import tube;
import graph3;
import three;

settings.outformat="html";
settings.render=4;
settings.autobillboard=false;

size(12cm);

//----------------------------
// Mode switch:
// true  -> Modified DH (Proximal)
// false -> Standard DH (Distal)
//----------------------------
bool isModified = false;

//----------------------------
// Data structures
//----------------------------
struct CoordFrame {
    triple O;
    triple x;
    triple y;
    triple z;
};

struct FramePair {
    CoordFrame prev;
    CoordFrame next;
};

struct DHParam {
    real theta;
    real d;
    real a;
    real alpha;
};

//----------------------------
// Camera setup
//----------------------------
currentprojection=perspective(
    camera=(11.9,12.7,12.4),
    up=(-0.01,-0.005,0.017),
    target=(-1.25,2.59,0.45)
);

defaultpen(fontsize(7pt));

//----------------------------
// Draw link geometry
//----------------------------
void DrawLink(transform3 TBase, transform3 TEnd, pen objStyle) {
    real h=1, r=0.5;
    path3 generator=(0.5*r,0,h)--(r,0,h)--(r,0,0)--(0.5*r,0,0);
    surface objSurface=surface(revolution(O,generator,0,360));
    draw(TBase*objSurface,objStyle);
    draw(TEnd*shift((0,0,-h+1e-5))*objSurface,objStyle);

    triple pStart=TBase*(0.5*h*Z);
    triple pEnd=TEnd*(-0.5*h*Z);
    triple pC1=0.25*(pEnd-pStart)+TBase*(0,0,h);
    triple pC2=-0.25*(pEnd-pStart)+TEnd*(0,0,-h);

    draw(tube(pStart..controls pC1 and pC2..pEnd, scale(0.2)*unitsquare),objStyle);
}

//----------------------------
// Draw coordinate frame
//----------------------------
void DrawFrame(CoordFrame f, string name) {
    real L=0.8;
    draw(Label("$X_{"+name+"}$",1), f.O--(f.O+L*f.x), red, Arrow3(6));
    draw(Label("$Y_{"+name+"}$",1), f.O--(f.O+L*f.y), green, Arrow3(6));
    draw(Label("$Z_{"+name+"}$",1), f.O--(f.O+L*f.z), blue, Arrow3(6));
    dot(Label("$O_{"+name+"}$", align=W), f.O);
}

//----------------------------
// Compute DH frames using common normal
//----------------------------
FramePair ComputeFrame(transform3 TPrev, transform3 TNext) {
    triple p1 = TPrev * O;
    triple z_prev = unit(TPrev * Z - p1);

    triple p2 = TNext * O;
    triple z_next = unit(TNext * Z - p2);

    triple n = cross(z_prev, z_next);
    triple footPrev, footNext;

    // Parallel case
    if(length(n) < 1e-6){
        real t = dot(p2 - p1, z_prev);
        footPrev = p1 + t * z_prev;
        footNext = p2;
    }
    // Skew lines case
    else {
        real[][] A = {
            {z_prev.x, -z_next.x, -n.x},
            {z_prev.y, -z_next.y, -n.y},
            {z_prev.z, -z_next.z, -n.z}
        };
        real[] b = {p2.x - p1.x, p2.y - p1.y, p2.z - p1.z};
        real[] x = solve(A, b);

        footPrev = p1 + x[0] * z_prev;
        footNext = p2 + x[1] * z_next;
    }

    triple x_axis = unit(footNext - footPrev);

    FramePair fp;

    // Previous frame
    fp.prev.O = footPrev;
    fp.prev.x = x_axis;
    fp.prev.z = z_prev;
    fp.prev.y = unit(cross(fp.prev.z, fp.prev.x));

    // Next frame (shares x-axis)
    fp.next.O = footNext;
    fp.next.x = x_axis;
    fp.next.z = z_next;
    fp.next.y = unit(cross(fp.next.z, fp.next.x));

    return fp;
}

//----------------------------
// Extract DH parameters
//----------------------------
DHParam ExtractDH(CoordFrame prev, CoordFrame next, bool isModified) {
    DHParam dh;
    triple dp = next.O - prev.O;

    if(!isModified){ // Standard DH
        dh.theta = atan2(dot(cross(prev.x,next.x), prev.z), dot(prev.x,next.x));
        dh.d     = dot(dp, prev.z);
        dh.a     = dot(dp, next.x);
        dh.alpha = atan2(dot(cross(prev.z,next.z), next.x), dot(prev.z,next.z));
    }
    else { // Modified DH
        dh.theta = atan2(dot(cross(prev.x,next.x), next.z), dot(prev.x,next.x));
        dh.d     = dot(dp, next.z);
        dh.a     = dot(dp, prev.x);
        dh.alpha = atan2(dot(cross(prev.z,next.z), prev.x), dot(prev.z,next.z));
    }

    return dh;
}

//----------------------------
// Scene construction
//----------------------------
transform3 t1 = shift((0,0,1));
transform3 t2 = shift((0,0,-1))*rotate(-20,Y)*shift((0,3,2));
transform3 t3 = t2*rotate(40,Z)*shift((0,3,1.5))*rotate(-15,Y)*shift(-1.5*Z);

DrawLink(t1, t2, palegreen);
DrawLink(t2, t3, lightmagenta);

FramePair fp1 = ComputeFrame(t1, t2);
FramePair fp2 = ComputeFrame(t2, t3);

// Select base and target frames depending on DH convention
CoordFrame baseFrame   = isModified ? fp1.prev : fp1.next;
CoordFrame targetFrame = isModified ? fp2.prev : fp2.next;

// Draw frames
if (isModified) {
    DrawFrame(baseFrame, "i-1");
    DrawFrame(targetFrame, "i");
} else {
    DrawFrame(baseFrame, "i");
    DrawFrame(targetFrame, "i+1");
}

//----------------------------
// Draw joint axes (Z axes)
//----------------------------
void DrawJointAxis(transform3 T, pen p=gray+dashed) {
    real axis_ext = 2.0;
    triple pos = T * O;
    triple dir = unit(T * Z - pos);
    draw((pos - axis_ext*dir) -- (pos + axis_ext*dir), p);
}

DrawJointAxis(t1);
DrawJointAxis(t2);
DrawJointAxis(t3);

// Extract DH parameters
DHParam dh = ExtractDH(baseFrame, targetFrame, isModified);

//---------------------------------------------------
// Static DH annotations
//---------------------------------------------------
real axis_len = 1.2;
pen linePen = cyan + linewidth(0.8pt) + dashed;
pen distPen = orange + linewidth(1.2pt);

if (isModified) {
    // Modified DH: (alpha_{i-1}, a_{i-1}, theta_i, d_i)

    draw(fp2.prev.O -- fp2.next.O, linePen);

    // alpha
    {
        // alpha_{i-1} (rotation about x_{i-1})
        triple O_alpha = baseFrame.O;

        triple v1 = unit(baseFrame.z);
        triple v2 = unit(targetFrame.z);

        // reference lines
        draw(O_alpha -- (O_alpha + axis_len*v1), linePen);
        draw(O_alpha -- (O_alpha + axis_len*v2), linePen);

        // arc with arrow
        real r = 0.8;
        draw(arc(O_alpha, O_alpha + r*v1, O_alpha + r*v2),
             ArcArrow3(3));

        // label on angle bisector
        triple bisector = unit(v1 + v2);
        label("$\alpha_{i-1}$", O_alpha + 1.2*r*bisector, N);
    }

    // a
    draw(baseFrame.O -- fp1.next.O, distPen, Arrow3(6));
    label("$a_{i-1}$", midpoint(baseFrame.O--fp1.next.O), S);

    // theta
    {
        // theta_i (rotation about z_i)
        triple O_theta = fp1.next.O;

        triple v1 = unit(baseFrame.x);
        triple v2 = unit(targetFrame.x);

        // reference lines
        draw(O_theta -- (O_theta + axis_len*v1), linePen);
        draw(O_theta -- (O_theta + axis_len*v2), linePen);

        // arc with arrow
        real r = 0.8;
        draw(arc(O_theta, O_theta + r*v1, O_theta + r*v2),
             ArcArrow3(3));

        // label on angle bisector
        triple bisector = unit(v1 + v2);
        label("$\theta_i$", O_theta + 1.2*r*bisector, N);
    }

    // d
    draw(fp1.next.O -- targetFrame.O, distPen, Arrow3(6));
    label("$d_i$", relpoint(fp1.next.O--targetFrame.O, 0.9), E);

} else {
    // Standard DH: (d_i, theta_i, a_i, alpha_i)

    draw(fp1.prev.O-- fp1.next.O, linePen);

    // d
    draw(baseFrame.O -- fp2.prev.O, distPen, Arrow3(6));

    label("$d_i$", relpoint(baseFrame.O--fp2.prev.O, 0.9), W);

    // theta
    {
        triple O_theta = fp2.prev.O;

        triple v1 = unit(baseFrame.x);
        triple v2 = unit(targetFrame.x);

        // draw edge lines of the angle
        draw(O_theta -- (O_theta + axis_len*v1), linePen);
        draw(O_theta -- (O_theta + axis_len*v2), linePen);

        // draw arc with array
        real r = 0.8; // arc radius
        draw(arc(O_theta, O_theta + r*v1, O_theta + r*v2),
             ArcArrow3(3));

        // label in the middle of the arc
        label("$\theta_i$", O_theta + r*unit(v1 + v2), N);
    }

    // a
    draw(fp2.prev.O -- targetFrame.O, distPen, Arrow3(6));
    label("$a_i$", midpoint(fp2.prev.O--targetFrame.O), S);

    // alpha (rotation about x axis)
    {
        triple O_alpha = targetFrame.O;

        triple v1 = unit(baseFrame.z);
        triple v2 = unit(targetFrame.z);

        // reference lines
        draw(O_alpha -- (O_alpha + axis_len*v1), linePen);
        draw(O_alpha -- (O_alpha + axis_len*v2), linePen);

        // arc with arrow
        real r = 0.8;
        draw(arc(O_alpha, O_alpha + r*v1, O_alpha + r*v2),
             ArcArrow3(3));

        // label (placed along angle bisector)
        triple bisector = unit(v1 + v2);
        label("$\alpha_i$", O_alpha + 1.2*r*bisector, E);
    }
}//----------------------------
// Animation system (JavaScript-based transform)
//----------------------------

// Build initial transform from base frame
transform3 T_start = {
    {baseFrame.x.x, baseFrame.y.x, baseFrame.z.x, baseFrame.O.x},
    {baseFrame.x.y, baseFrame.y.y, baseFrame.z.y, baseFrame.O.y},
    {baseFrame.x.z, baseFrame.y.z, baseFrame.z.z, baseFrame.O.z},
    {0, 0, 0, 1}
};

// Pass initial transform matrix to JavaScript
javascript("
var M0 = ["+string(T_start[0][0])+","+string(T_start[0][1])+","+string(T_start[0][2])+","+string(T_start[0][3])+",
          "+string(T_start[1][0])+","+string(T_start[1][1])+","+string(T_start[1][2])+","+string(T_start[1][3])+",
          "+string(T_start[2][0])+","+string(T_start[2][1])+","+string(T_start[2][2])+","+string(T_start[2][3])+"];

// Matrix multiplication (4x4)
function mult(A, B) {
    var C = new Array(16);
    for(var i=0; i<4; i++){
        for(var j=0; j<4; j++){
            C[i*4+j] = A[i*4]*B[j] + A[i*4+1]*B[4+j] + A[i*4+2]*B[8+j] + A[i*4+3]*B[12+j];
        }
    }
    return C;
}
");

//----------------------------
// Animated transformation (DH sequence)
//----------------------------
beginTransform(geometry="
function(x,t){
    var alpha = "+string(dh.alpha)+";
    var a     = "+string(dh.a)+";
    var theta = "+string(dh.theta)+";
    var d     = "+string(dh.d)+";

    var isMod = "+(isModified ? "true" : "false")+";

    // Time segmentation for 4-step animation
    var k = [
        Math.min(Math.max(t/0.25,0),1),
        Math.min(Math.max((t-0.25)/0.25,0),1),
        Math.min(Math.max((t-0.5)/0.25,0),1),
        Math.min(Math.max((t-0.75)/0.25,0),1)
    ];

    // Basic transform blocks
    function Rx(v){ var c=Math.cos(v), s=Math.sin(v); return [1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1]; }
    function Tx(v){ return [1,0,0,v, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
    function Rz(v){ var c=Math.cos(v), s=Math.sin(v); return [c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1]; }
    function Tz(v){ return [1,0,0,0, 0,1,0,0, 0,0,1,v, 0,0,0,1]; }

    var M;

    if(isMod) {
        // Modified DH sequence:
        // Rx(alpha) -> Tx(a) -> Rz(theta) -> Tz(d)
        M = mult(Rx(alpha*k[0]),
            mult(Tx(a*k[1]),
            mult(Rz(theta*k[2]),
                 Tz(d*k[3]))));
    } else {
        // Standard DH sequence:
        // Tz(d) -> Rz(theta) -> Tx(a) -> Rx(alpha)
        M = mult(Tz(d*k[0]),
            mult(Rz(theta*k[1]),
            mult(Tx(a*k[2]),
                 Rx(alpha*k[3]))));
    }

    // Apply local transform
    var lx = M[0]*x[0] + M[1]*x[1] + M[2]*x[2] + M[3];
    var ly = M[4]*x[0] + M[5]*x[1] + M[6]*x[2] + M[7];
    var lz = M[8]*x[0] + M[9]*x[1] + M[10]*x[2] + M[11];

    // Apply base frame transform (global)
    return [
        M0[0]*lx+M0[1]*ly+M0[2]*lz+M0[3],
        M0[4]*lx+M0[5]*ly+M0[6]*lz+M0[7],
        M0[8]*lx+M0[9]*ly+M0[10]*lz+M0[11]
    ];
}
", 10);

//----------------------------
// Draw moving frame (animated)
//----------------------------
draw(O--(0.8,0,0), red, Arrow3(6));
draw(O--(0,0.8,0), green, Arrow3(6));
draw(O--(0,0,0.8), blue, Arrow3(6));
dot(O);

//----------------------------
// UI: slider style + auto play
//----------------------------
javascript("
let style = document.createElement('style');
style.textContent = '.slider { width:80%!important; left:10%!important; bottom:20px; }';
document.head.appendChild(style);

// Auto-trigger animation on page load
window.addEventListener('load', function() {
    setTimeout(function() {
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'b',
            code: 'KeyB',
            keyCode: 66,
            which: 66,
            bubbles: true
        }));
    }, 600);
});
");