import solids;
import tube;
import graph3;

settings.outformat="html";
settings.render=4;
settings.autobillboard=false;

size(12cm);


currentprojection=  perspective(
camera=(11.936402050121263,12.761463716248636,12.484787169976029),
up=(-0.01174215254051009,-0.005367714721889965,0.017407746287857056),
target=(-1.254545352560001,2.5928194567802496,0.45150340390249966));

defaultpen(fontsize(7pt));


// drawing coordinates XYZ system, and some lines and text labels
void DrawFrame(transform3 TBase, transform3 TEnd, string s)
{
    triple p1=TBase*O;
    triple v1=unit(TBase*Z-p1); // Use unit vectors to stabilize math
    triple p2=TEnd*O;
    triple v2=unit(TEnd*Z-p2);
    triple n=cross(v1,v2);

    // If n is zero, the axes are parallel, and the solver will crash
    if (length(n) < 1e-6) {
        // Handle parallel axes: just draw a line between origins or skip
        label("Parallel Axes - Skip Normal", p1, red);
    } else {
        real[][] A={{v1.x,-v2.x,-n.x},{v1.y,-v2.y,-n.y},{v1.z,-v2.z,-n.z}};
        triple vb=p2-p1;
        real[] b={vb.x,vb.y,vb.z};
        
        // This is the line that might be crashing
        real[] x=solve(A,b);

        triple foot1=p1+x[0]*v1;
        triple foot2=p2+x[1]*v2;

        // Draw axes lines (extending from the joint)
        real axisLineLength = 1.5; // 轴线长度，可调
        draw((p1 + x[0]*v1 + axisLineLength*v1) -- (p1 + x[0]*v1 - axisLineLength*v1), gray + dashed);
        draw((p2 + x[1]*v2 + axisLineLength*v2) -- (p2 + x[1]*v2 - axisLineLength*v2), gray + dashed);

        // Common normal "a"
        draw(Label("$a_{"+s+"}$"), foot1--foot2, linewidth(1pt));

        // Coordinate Frame logic...
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

// draw 2 cylinders, and the tube between the cylinders
void DrawLink(transform3 TBase, transform3 TEnd, pen objStyle) {
    real h=1; real r=0.5;
    path3 generator=(0.5*r,0,h)--(r,0,h)--(r,0,0)--(0.5*r,0,0);
    surface objSurface=surface(revolution(O,generator,0,360));
    draw(TBase*objSurface,objStyle,render(merge=true));
    draw(TEnd*shift((0,0,-h+1e-5))*objSurface,objStyle,render(merge=true));
    
    triple pStart=TBase*(0.5*h*Z);
    triple pEnd=TEnd*(-0.5*h*Z);
    triple pC1=0.25*(pEnd-pStart)+TBase*(0,0,h);
    triple pC2=-0.25*(pEnd-pStart)+TEnd*(0,0,-h);
    draw(tube(pStart..controls pC1 and pC2..pEnd, scale(0.2)*unitsquare),objStyle);
}




//---------------------------------------------------
// Draw a coordinate frame
//---------------------------------------------------
void DrawMovingFrame(string s)
{
    real len = 0.8;
    triple O = (0,0,0);
    
    if (s != "") {
        // Draw with labels
        draw(Label("$X_{"+s+"}$", 1), O--(len,0,0), red+linewidth(1.2pt), Arrow3(6));
        draw(Label("$Y_{"+s+"}$", 1), O--(0,len,0), green+linewidth(1.2pt), Arrow3(6));
        draw(Label("$Z_{"+s+"}$", 1), O--(0,0,len), blue+linewidth(1.2pt), Arrow3(6));
        dot(Label("$O_{"+s+"}$", align=W), O);
    } else {
        // Draw without labels
        draw(O--(len,0,0), red+linewidth(1.2pt), Arrow3(6));
        draw(O--(0,len,0), green+linewidth(1.2pt), Arrow3(6));
        draw(O--(0,0,len), blue+linewidth(1.2pt), Arrow3(6));
        dot(O);
    }
}

//---------------------------------------------------
// Compute common-normal frame
//---------------------------------------------------
triple[] ComputeFrame(transform3 T1, transform3 T2)
{
    triple O=(0,0,0);
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

    triple[] result = new triple[5]; // 增加一位
    result[0] = foot1;              // Origin (common normal 起点)
    result[1] = unit(foot2-foot1);  // X (Common normal 方向)
    result[3] = v1;                 // Z (Axis i-1)
    result[2] = unit(cross(result[3], result[1])); // Y
    result[4] = foot2;              // 返回 common normal 终点，用于 theta 圆心
    return result;
}

void DrawBoundingBox(triple center, real size) {
    // Define the 8 corners of the box
    real r = size / 2;
    triple p0 = center + (-r, -r, -r);
    triple p1 = center + ( r, -r, -r);
    triple p2 = center + ( r,  r, -r);
    triple p3 = center + (-r,  r, -r);
    triple p4 = center + (-r, -r,  r);
    triple p5 = center + ( r, -r,  r);
    triple p6 = center + ( r,  r,  r);
    triple p7 = center + (-r,  r,  r);

    // Draw the 12 edges with a very faint or null pen
    // Using invisible pen or very light gray
    pen ghostPen = linetype(new real[] {8, 8}) + gray + opacity(0.2); 

    // Bottom face
    draw(p0--p1--p2--p3--cycle, ghostPen);
    // Top face
    draw(p4--p5--p6--p7--cycle, ghostPen);
    // Vertical pillars
    draw(p0--p4, ghostPen);
    draw(p1--p5, ghostPen);
    draw(p2--p6, ghostPen);
    draw(p3--p7, ghostPen);
}

// Usage: Draw a 10x10x10 box centered at (0,0,0)
// DrawBoundingBox((0,0,0), 10);

// Transforms
transform3 t1 = shift((0,0,1));
transform3 t2 = shift((0,0,-1))*rotate(-20,Y)*shift((0,3,2));
transform3 t3 = t2*rotate(40,Z)*shift((0,3,1.5))*rotate(-15,Y)*shift(-1.5*Z);



// --- 1. STATIC SCENE (Link i-1) ---
DrawLink(t1, t2, palegreen);
DrawFrame(t1, t2, "i-1");

DrawLink(t2, t3, lightmagenta);
DrawFrame(t2, t3, "i");

triple[] frame_a = ComputeFrame(t1,t2); 
triple[] frame_i = ComputeFrame(t2,t3);

real alpha_param = atan2(dot(cross(frame_a[3], frame_i[3]), frame_a[1]), dot(frame_a[3], frame_i[3]));
real a_param = dot(frame_i[0] - frame_a[0], frame_a[1]);
real theta_param = atan2(dot(cross(frame_a[1], frame_i[1]), frame_i[3]), dot(frame_a[1], frame_i[1]));
real d_param = dot(frame_i[0] - frame_a[0], frame_i[3]);

// --- ANIMATION ---
transform3 Ti_1 = shift(frame_a[0]) * transform3(frame_a[1], frame_a[2], frame_a[3]);


// 静态标注层，画角度、长度、固定坐标轴
// 这些都不随动画变化

// 静态角度 alpha_i
// 关节 i 的位置作为顶点
triple O_alpha = frame_a[0];

// 分开两个长度
real axis_len = 2.5;   // 辅助线长度（长一点）
real arc_len  = 1.2;   // 弧半径（短一点）

// 方向
triple z_i_1 = frame_a[3];
triple z_i   = frame_i[3];

// 辅助线（长）
draw(O_alpha -- (O_alpha + axis_len*z_i_1), cyan);
draw(O_alpha -- (O_alpha + axis_len*z_i),   cyan);

// 弧（短）
triple p1_arc = O_alpha + arc_len*z_i_1;
triple p2_arc = O_alpha + arc_len*z_i;

// 弧线
draw("$\alpha_{i-1}$", arc(O_alpha, p1_arc, p2_arc), ArcArrow3(3));


// 静态角度 theta_i
// alpha_i 圆心
triple O_theta = frame_a[4];

// 分开长度
real axis_len = 2.0;
real arc_len  = 1.0;

// 方向
triple x_i_1 = frame_a[1];
triple x_i   = frame_i[1];

// 辅助线（长）
draw(O_theta -- (O_theta + axis_len*x_i_1), cyan);
draw(O_theta -- (O_theta + axis_len*x_i),   cyan);

// 弧（短）
triple p1_arc = O_theta + arc_len*x_i_1;
triple p2_arc = O_theta + arc_len*x_i;

// 弧线
draw("$\theta_i$", arc(O_theta, p1_arc, p2_arc), ArcArrow3(3));


// 静态长度 d_i
// d_i：沿 axis_i（Z_i）方向

triple P_start = frame_a[4];  // 第一段公垂线末端（foot2）
triple P_end   = frame_i[0];  // 第二段公垂线起点（foot1）

draw(Label("$d_i$",0.2), P_start -- P_end, linewidth(1pt));



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
    var k1 = Math.min(Math.max(t / 0.25, 0), 1), k2 = Math.min(Math.max((t - 0.25) / 0.25, 0), 1), 
        k3 = Math.min(Math.max((t - 0.5) / 0.25, 0), 1), k4 = Math.min(Math.max((t - 0.75) / 0.25, 0), 1);

    // Modified DH Order: Rx(alpha) * Tx(a) * Rz(theta) * Tz(d)
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

    return [m[0]*lx+m[1]*ly+m[2]*lz+m[3], m[4]*lx+m[5]*ly+m[6]*lz+m[7], m[8]*lx+m[9]*ly+m[10]*lz+m[11]];
}
", 10);


DrawMovingFrame("");
endTransform();

javascript("
let style=document.createElement('style');
style.textContent='.slider{width:80%!important;left:10%!important;bottom:20px;}';
document.head.appendChild(style);
");