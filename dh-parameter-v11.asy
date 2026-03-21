import solids;
import tube;
import graph3;

settings.outformat="html";
settings.render=4;
settings.autobillboard=false;

size(12cm);

//---------------------------------------------------
// Camera setup
//---------------------------------------------------
currentprojection=perspective(
camera=(11.936402050121263,12.761463716248636,12.484787169976029),
up=(-0.01174215254051009,-0.005367714721889965,0.017407746287857056),
target=(-1.254545352560001,2.5928194567802496,0.45150340390249966)
);

defaultpen(fontsize(7pt));

//---------------------------------------------------
// Draw DH coordinate frame and common normal
//---------------------------------------------------
void DrawFrame(transform3 TBase, transform3 TEnd, string s)
{
    triple p1=TBase*O;
    triple v1=unit(TBase*Z-p1); // axis i-1 direction
    triple p2=TEnd*O;
    triple v2=unit(TEnd*Z-p2); // axis i direction
    triple n=cross(v1,v2);

    // Handle parallel axes (avoid singularity)
    if (length(n) < 1e-6) {
        label("Parallel Axes - Skip Normal", p1, red);
    } else {
        real[][] A={{v1.x,-v2.x,-n.x},{v1.y,-v2.y,-n.y},{v1.z,-v2.z,-n.z}};
        triple vb=p2-p1;
        real[] b={vb.x,vb.y,vb.z};
        real[] x=solve(A,b);

        triple foot1=p1+x[0]*v1; // closest point on axis i-1
        triple foot2=p2+x[1]*v2; // closest point on axis i

        // Draw extended joint axes
        real axisLineLength = 1.5;
        draw((foot1 + axisLineLength*v1) -- (foot1 - axisLineLength*v1), gray + dashed);
        draw((foot2 + axisLineLength*v2) -- (foot2 - axisLineLength*v2), gray + dashed);

        // Draw common normal (a_i)
        draw(Label("$a_{"+s+"}$"), foot1--foot2, linewidth(1pt));

        // Construct local coordinate frame at foot1
        real len=0.8;
        triple org=foot1;
        triple dx=len*unit(foot2-foot1); // X axis (common normal)
        triple dz=len*v1;                // Z axis (axis i-1)
        triple dy=len*unit(cross(dz,dx));// Y axis

        draw(Label("$X_{"+s+"}$",1), org--(org+dx), red+linewidth(1.2pt), Arrow3(6));
        draw(Label("$Y_{"+s+"}$",1), org--(org+dy), green+linewidth(1.2pt), Arrow3(6));
        draw(Label("$Z_{"+s+"}$",1), org--(org+dz), blue+linewidth(1.2pt), Arrow3(6));
        dot(Label("$O_{"+s+"}$", align=W), org);
    }
}

//---------------------------------------------------
// Draw link geometry (cylinders + connecting tube)
//---------------------------------------------------
void DrawLink(transform3 TBase, transform3 TEnd, pen objStyle) {
    real h=1, r=0.5;

    path3 generator=(0.5*r,0,h)--(r,0,h)--(r,0,0)--(0.5*r,0,0);
    surface objSurface=surface(revolution(O,generator,0,360));

    draw(TBase*objSurface,objStyle,render(merge=true));
    draw(TEnd*shift((0,0,-h+1e-5))*objSurface,objStyle,render(merge=true));
    
    // Smooth tube between two joints
    triple pStart=TBase*(0.5*h*Z);
    triple pEnd=TEnd*(-0.5*h*Z);
    triple pC1=0.25*(pEnd-pStart)+TBase*(0,0,h);
    triple pC2=-0.25*(pEnd-pStart)+TEnd*(0,0,-h);

    draw(tube(pStart..controls pC1 and pC2..pEnd, scale(0.2)*unitsquare),objStyle);
}

//---------------------------------------------------
// Draw a moving coordinate frame (used in animation)
//---------------------------------------------------
void DrawMovingFrame(string s)
{
    real len = 0.8;
    triple O = (0,0,0);
    
    if (s != "") {
        // Draw labeled axes
        draw(Label("$X_{"+s+"}$", 1), O--(len,0,0), red+linewidth(1.2pt), Arrow3(6));
        draw(Label("$Y_{"+s+"}$", 1), O--(0,len,0), green+linewidth(1.2pt), Arrow3(6));
        draw(Label("$Z_{"+s+"}$", 1), O--(0,0,len), blue+linewidth(1.2pt), Arrow3(6));
        dot(Label("$O_{"+s+"}$", align=W), O);
    } else {
        // Draw unlabeled axes (cleaner for animation)
        draw(O--(len,0,0), red+linewidth(1.2pt), Arrow3(6));
        draw(O--(0,len,0), green+linewidth(1.2pt), Arrow3(6));
        draw(O--(0,0,len), blue+linewidth(1.2pt), Arrow3(6));
        dot(O);
    }
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

//---------------------------------------------------
// Static geometry
//---------------------------------------------------
DrawLink(t1, t2, palegreen);
DrawFrame(t1, t2, "i-1");

DrawLink(t2, t3, lightmagenta);
DrawFrame(t2, t3, "i");

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
real arc_len  = 1.2;

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
// Animation setup (Modified DH)
//---------------------------------------------------
real alpha_param = atan2(dot(cross(frame_a[3], frame_i[3]), frame_a[1]), dot(frame_a[3], frame_i[3]));
real a_param = dot(frame_i[0] - frame_a[0], frame_a[1]);
real theta_param = atan2(dot(cross(frame_a[1], frame_i[1]), frame_i[3]), dot(frame_a[1], frame_i[1]));
real d_param = dot(frame_i[0] - frame_a[0], frame_i[3]);

transform3 Ti_1 = shift(frame_a[0]) * transform3(frame_a[1], frame_a[2], frame_a[3]);

javascript("
var m = ["+string(Ti_1[0][0])+","+string(Ti_1[0][1])+","+string(Ti_1[0][2])+","+string(Ti_1[0][3])+",
         "+string(Ti_1[1][0])+","+string(Ti_1[1][1])+","+string(Ti_1[1][2])+","+string(Ti_1[1][3])+",
         "+string(Ti_1[2][0])+","+string(Ti_1[2][1])+","+string(Ti_1[2][2])+","+string(Ti_1[2][3])+"];

function mult(A, B) {
    var C = new Array(16);
    for(var i=0; i<4; i++) {
        for(var j=0; j<4; j++) {
            C[i*4+j] = A[i*4]*B[j] + A[i*4+1]*B[4+j] + A[i*4+2]*B[8+j] + A[i*4+3]*B[12+j];
        }
    }
    return C;
}
");

beginTransform(geometry="
function(x, t) {
    var a = "+string(a_param)+", d = "+string(d_param)+", theta = "+string(theta_param)+", alpha = "+string(alpha_param)+";
    
    var k1 = Math.min(Math.max(t / 0.25, 0), 1),
        k2 = Math.min(Math.max((t - 0.25) / 0.25, 0), 1),
        k3 = Math.min(Math.max((t - 0.5) / 0.25, 0), 1),
        k4 = Math.min(Math.max((t - 0.75) / 0.25, 0), 1);

    // Modified DH sequence: Rx(alpha) * Tx(a) * Rz(theta) * Tz(d)
    var ca = Math.cos(alpha*k1), sa = Math.sin(alpha*k1);
    var Mx = [1,0,0,0, 0,ca,-sa,0, 0,sa,ca,0, 0,0,0,1];

    var Ma = [1,0,0,a*k2, 0,1,0,0, 0,0,1,0, 0,0,0,1];

    var ct = Math.cos(theta*k3), st = Math.sin(theta*k3);
    var Mz = [ct,-st,0,0, st,ct,0,0, 0,0,1,0, 0,0,0,1];

    var Md = [1,0,0,0, 0,1,0,0, 0,0,1,d*k4, 0,0,0,1];

    var M = mult(Mx, mult(Ma, mult(Mz, Md)));

    var lx = M[0]*x[0] + M[1]*x[1] + M[2]*x[2] + M[3];
    var ly = M[4]*x[0] + M[5]*x[1] + M[6]*x[2] + M[7];
    var lz = M[8]*x[0] + M[9]*x[1] + M[10]*x[2] + M[11];

    return [m[0]*lx+m[1]*ly+m[2]*lz+m[3],
            m[4]*lx+m[5]*ly+m[6]*lz+m[7],
            m[8]*lx+m[9]*ly+m[10]*lz+m[11]];
}
", 10);

// Draw moving frame
DrawMovingFrame("");

endTransform();

// UI slider style
javascript("
let style=document.createElement('style');
style.textContent='.slider{width:80%!important;left:10%!important;bottom:20px;}';
document.head.appendChild(style);
");