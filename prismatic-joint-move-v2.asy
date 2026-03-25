import solids;
import tube;
import graph3;
import palette;

settings.outformat="html";
settings.render=4;
settings.autobillboard=false;

size(12cm);

currentprojection=perspective(
camera=(13.3, 8.0, 14.5), 
up=(-0.02, -0.004, 0.02), 
target=(-1.06, 2.68, 0.8)
);

defaultpen(fontsize(7pt));

//---------------------------------------------------
// Draw DH frame and common normal
//---------------------------------------------------
void DrawFrame(transform3 TBase, transform3 TEnd, string s)
{
    triple p1=TBase*O;
    triple v1=unit(TBase*Z-p1);
    triple p2=TEnd*O;
    triple v2=unit(TEnd*Z-p2);
    triple n=cross(v1,v2);

    if (length(n) < 1e-6) {
        label("Parallel Axes", p1, red);
    } else {
        real[][] A={{v1.x,-v2.x,-n.x},{v1.y,-v2.y,-n.y},{v1.z,-v2.z,-n.z}};
        real[] b={p2.x-p1.x,p2.y-p1.y,p2.z-p1.z};
        real[] x=solve(A,b);

        triple foot1=p1+x[0]*v1;
        triple foot2=p2+x[1]*v2;

        real axisLineLength=1.8;
        draw((foot1+axisLineLength*v1)--(foot1-axisLineLength*v1), gray+dashed);
        draw((foot2+axisLineLength*v2)--(foot2-axisLineLength*v2), gray+dashed);

        draw(Label("$a_{"+s+"}$"), foot1--foot2, linewidth(1.5pt));

        real len=0.8;
        triple org=foot1;
        triple dx=len*unit(foot2-foot1);
        triple dz=len*v1;
        triple dy=len*unit(cross(dz,dx));

        draw(Label("$X_{"+s+"}$",1), org--(org+dx), red+linewidth(1.2pt), Arrow3(6));
        draw(Label("$Y_{"+s+"}$",1), org--(org+dy), green+linewidth(1.2pt), Arrow3(6));
        draw(Label("$Z_{"+s+"}$",1), org--(org+dz), blue+linewidth(1.2pt), Arrow3(6));
        dot(Label("$O_{"+s+"}$", align=W), org);
    }
}

//---------------------------------------------------
// Draw link geometry (box + tube)
//---------------------------------------------------
void DrawLink(transform3 TBase, transform3 TEnd, pen objStyle) {
    real s=0.8;
    real z_len=1.5;

    transform3 T_slider = shift(-s/2,-s/2,-z_len/2)
                        * xscale3(s)*yscale3(s)*zscale3(z_len);

    real shrink=0.95;
    real s_thin=s*shrink;

    transform3 T_base = shift(-s_thin/2,-s_thin/2,-z_len/2)
                      * xscale3(s_thin)*yscale3(s_thin)*zscale3(z_len);

    surface cube_slider=T_slider*unitcube;
    surface cube_base=T_base*unitcube;

    draw(TBase*cube_base,objStyle,render(merge=true));
    draw(TEnd*cube_slider,objStyle,render(merge=true));

    triple pStart=TBase*O;
    triple pEnd=TEnd*O;

    draw(tube(pStart--pEnd,scale(0.2)*unitsquare),objStyle);
}

//---------------------------------------------------
// Compute DH frame (common normal frame)
//---------------------------------------------------
triple[] ComputeFrame(transform3 T1, transform3 T2)
{
    triple p1=T1*O;
    triple v1=unit(T1*Z-p1);
    triple p2=T2*O;
    triple v2=unit(T2*Z-p2);
    triple n=cross(v1,v2);

    triple foot1, foot2;

    if(length(n)<1e-6){
        real t=dot(p2-p1,v1);
        foot1=p1+t*v1;
        foot2=p2;
    } else {
        real[][] A={{v1.x,-v2.x,-n.x},{v1.y,-v2.y,-n.y},{v1.z,-v2.z,-n.z}};
        real[] b={p2.x-p1.x, p2.y-p1.y, p2.z-p1.z};
        real[] x=solve(A,b);

        foot1=p1+x[0]*v1;
        foot2=p2+x[1]*v2;
    }

    triple[] result = new triple[5];
    result[0] = foot1;                 // origin (start of common normal)
    result[1] = unit(foot2-foot1);     // X axis (common normal)
    result[3] = v1;                    // Z axis (axis i-1)
    result[2] = unit(cross(result[3], result[1])); // Y axis
    result[4] = foot2;                 // end of common normal
    return result;
}

//---------------------------------------------------
// Transform definitions
//---------------------------------------------------
transform3 t1 = shift((0,0,1));
transform3 t2 = shift((0,0,-1))*rotate(-20,Y)*shift((0,3,2));
transform3 t3 = t2*rotate(40,Z)*shift((0,3,1.5))*rotate(-15,Y)*shift(-1.5*Z);

transform3 t3_rel = inverse(t2)*t3;

//---------------------------------------------------
// Static geometry
//---------------------------------------------------
DrawLink(t1, t2, palegreen);
DrawFrame(t1, t2, "i-1");

//DrawLink(t2, t3, lightmagenta);
//DrawFrame(t2, t3, "i");

//---------------------------------------------------
// Compute DH frames
//---------------------------------------------------
triple[] frame_a = ComputeFrame(t1,t2); 
triple[] frame_i = ComputeFrame(t2,t3);

//---------------------------------------------------
// Static annotation layer (angles and distances)
//---------------------------------------------------

// ===== alpha_{i-1} =====
triple O_alpha = frame_a[0];

real axis_len = 2.5;
real arc_len  = 0.5;

triple z_i_1 = frame_a[3];
triple z_i   = frame_i[3];

draw(O_alpha -- (O_alpha + axis_len*z_i_1), cyan);
draw(O_alpha -- (O_alpha + axis_len*z_i),   cyan);

draw("$\alpha_{i-1}$",
     arc(O_alpha, O_alpha + arc_len*z_i_1, O_alpha + arc_len*z_i),
     ArcArrow3(3));

// ===== theta_i =====
triple O_theta = frame_a[4];

real axis_len2 = 2.0;
real arc_len2  = 1.0;

triple x_i_1 = frame_a[1];
triple x_i   = frame_i[1];

draw(O_theta -- (O_theta + axis_len2*x_i_1), cyan);
draw(O_theta -- (O_theta + axis_len2*x_i),   cyan);

draw("$\theta_i$",
     arc(O_theta, O_theta + arc_len2*x_i_1, O_theta + arc_len2*x_i),
     ArcArrow3(3));

// ===== d_i =====
triple P_start = frame_a[4];
triple P_end   = frame_i[0];

draw(Label("$d_i$",0.2), P_start -- P_end, linewidth(1pt));


//---------------------------------------------------
// JAVASCRIPT TRANSFORM
//---------------------------------------------------
javascript("
let m = [
"+string(t2[0][0])+","+string(t2[0][1])+","+string(t2[0][2])+","+string(t2[0][3])+",
"+string(t2[1][0])+","+string(t2[1][1])+","+string(t2[1][2])+","+string(t2[1][3])+",
"+string(t2[2][0])+","+string(t2[2][1])+","+string(t2[2][2])+","+string(t2[2][3])+"
];

function applyPrismatic(x, d) {
    let rx=x[0];
    let ry=x[1];
    let rz=x[2]+d;

    return [
        m[0]*rx+m[1]*ry+m[2]*rz+m[3],
        m[4]*rx+m[5]*ry+m[6]*rz+m[7],
        m[8]*rx+m[9]*ry+m[10]*rz+m[11]
    ];
}
");

//---------------------------------------------------
// ANIMATION (ONLY PRISMATIC)
//---------------------------------------------------
beginTransform(geometry="
function(x,t){
    var maxTranslation=1.0;
    var d=maxTranslation*Math.min(t,1.0);
    return applyPrismatic(x,d);
}
",10);

    DrawLink(identity4,t3_rel,lightmagenta);
    DrawFrame(identity4,t3_rel,"i");


endTransform();

//---------------------------------------------------
// SLIDER STYLE + AUTO SHOW
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