/*@license
 AsyGL: Render Bezier patches and triangles via subdivision with WebGL.
  Copyright 2019-2024: John C. Bowman and Supakorn "Jamie" Rassameemasmuang
  University of Alberta

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation; either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
/*@license for gl-matrix mat3 and mat4 functions:
Copyright (c) 2015, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.*/
let vertex=`
#ifdef WEBGL2
#define IN in
#define OUT out
#else
#define IN attribute
#define OUT varying
#endif

IN vec3 position;
#ifdef WIDTH
IN float width;
#endif
#ifdef NORMAL
IN vec3 normal;
#endif

IN float materialIndex;

#ifdef WEBGL2
flat out int MaterialIndex;
#ifdef COLOR
OUT vec4 Color;
#endif

#else
OUT vec4 diffuse;
OUT vec3 specular;
OUT float roughness,metallic,fresnel0;
OUT vec4 emissive;

struct Material {
  vec4 diffuse,emissive,specular;
  vec4 parameters;
};

uniform Material Materials[Nmaterials];
#endif

#ifdef COLOR
IN vec4 color;
#endif

uniform mat3 normMat;
uniform mat4 viewMat;
uniform mat4 projViewMat;

#ifdef NORMAL
#ifndef ORTHOGRAPHIC
OUT vec3 ViewPosition;
#endif
OUT vec3 Normal;
#endif

void main(void)
{
  vec4 v=vec4(position,1.0);
  gl_Position=projViewMat*v;

#ifdef NORMAL
#ifndef ORTHOGRAPHIC
  ViewPosition=(viewMat*v).xyz;
#endif
  Normal=normalize(normal*normMat);
#endif

#ifdef WEBGL2
  MaterialIndex=int(materialIndex);
#ifdef COLOR
  Color=color;
#endif
#else
#ifdef NORMAL
  Material m;
#ifdef TRANSPARENT
  m=Materials[int(abs(materialIndex))-1];
  emissive=m.emissive;
  if(materialIndex >= 0.0)
    diffuse=m.diffuse;
  else {
    diffuse=color;
#if nlights == 0
    emissive += color;
#endif
  }
#else
  m=Materials[int(materialIndex)];
  emissive=m.emissive;
#ifdef COLOR
  diffuse=color;
#if nlights == 0
    emissive += color;
#endif
#else
  diffuse=m.diffuse;
#endif // COLOR
#endif // TRANSPARENT
  specular=m.specular.rgb;
  vec4 parameters=m.parameters;
  roughness=1.0-parameters[0];
  metallic=parameters[1];
  fresnel0=parameters[2];
#else
  emissive=Materials[int(materialIndex)].emissive;
#endif // NORMAL
#endif // WEBGL2

#ifdef WIDTH
  gl_PointSize=width;
#endif
}
`;
let fragment=`
#ifdef WEBGL2
#define IN in
out vec4 outValue;
#define OUTVALUE outValue
#else
#define IN varying
#define OUTVALUE gl_FragColor
#endif

#ifdef WEBGL2
flat in int MaterialIndex;

struct Material {
  vec4 diffuse,emissive,specular;
  vec4 parameters;
};

uniform Material Materials[Nmaterials];

vec4 diffuse;
vec3 specular;
float roughness,metallic,fresnel0;
vec4 emissive;

#ifdef COLOR
in vec4 Color;
#endif

#else
IN vec4 diffuse;
IN vec3 specular;
IN float roughness,metallic,fresnel0;
IN vec4 emissive;
#endif

#ifdef NORMAL

#ifndef ORTHOGRAPHIC
IN vec3 ViewPosition;
#endif
IN vec3 Normal;

vec3 normal;

struct Light {
  vec3 direction;
  vec3 color;
};

uniform Light Lights[Nlights];

#ifdef USE_IBL
uniform sampler2D reflBRDFSampler;
uniform sampler2D diffuseSampler;
uniform sampler2D reflImgSampler;

const float pi=acos(-1.0);
const float piInv=1.0/pi;
const float twopi=2.0*pi;
const float twopiInv=1.0/twopi;

// (x,y,z) -> (r,theta,phi);
// theta -> [0,pi]: colatitude
// phi -> [-pi,pi]: longitude
vec3 cart2sphere(vec3 cart)
{
  float x=cart.x;
  float y=cart.z;
  float z=cart.y;

  float r=length(cart);
  float theta=r > 0.0 ? acos(z/r) : 0.0;
  float phi=atan(y,x);

  return vec3(r,theta,phi);
}

vec2 normalizedAngle(vec3 cartVec)
{
  vec3 sphericalVec=cart2sphere(cartVec);
  sphericalVec.y=sphericalVec.y*piInv;
  sphericalVec.z=0.75-sphericalVec.z*twopiInv;
  return sphericalVec.zy;
}

vec3 IBLColor(vec3 viewDir)
{
  vec3 IBLDiffuse=diffuse.rgb*texture(diffuseSampler,normalizedAngle(normal)).rgb;
  vec3 reflectVec=normalize(reflect(-viewDir,normal));
  vec2 reflCoord=normalizedAngle(reflectVec);
  vec3 IBLRefl=textureLod(reflImgSampler,reflCoord,roughness*ROUGHNESS_STEP_COUNT).rgb;
  vec2 IBLbrdf=texture(reflBRDFSampler,vec2(dot(normal,viewDir),roughness)).rg;
  float specularMultiplier=fresnel0*IBLbrdf.x+IBLbrdf.y;
  vec3 dielectric=IBLDiffuse+specularMultiplier*IBLRefl;
  vec3 metal=diffuse.rgb*IBLRefl;
  return mix(dielectric,metal,metallic);
}
#else
float Roughness2;
float NDF_TRG(vec3 h)
{
  float ndoth=max(dot(normal,h),0.0);
  float alpha2=Roughness2*Roughness2;
  float denom=ndoth*ndoth*(alpha2-1.0)+1.0;
  return denom != 0.0 ? alpha2/(denom*denom) : 0.0;
}

float GGX_Geom(vec3 v)
{
  float ndotv=max(dot(v,normal),0.0);
  float ap=1.0+Roughness2;
  float k=0.125*ap*ap;
  return ndotv/((ndotv*(1.0-k))+k);
}

float Geom(vec3 v, vec3 l)
{
  return GGX_Geom(v)*GGX_Geom(l);
}

float Fresnel(vec3 h, vec3 v, float fresnel0)
{
  float a=1.0-max(dot(h,v),0.0);
  float b=a*a;
  return fresnel0+(1.0-fresnel0)*b*b*a;
}

// physical based shading using UE4 model.
vec3 BRDF(vec3 viewDirection, vec3 lightDirection)
{
  vec3 lambertian=diffuse.rgb;
  vec3 h=normalize(lightDirection+viewDirection);

  float omegain=max(dot(viewDirection,normal),0.0);
  float omegaln=max(dot(lightDirection,normal),0.0);

  float D=NDF_TRG(h);
  float G=Geom(viewDirection,lightDirection);
  float F=Fresnel(h,viewDirection,fresnel0);

  float denom=4.0*omegain*omegaln;
  float rawReflectance=denom > 0.0 ? (D*G)/denom : 0.0;

  vec3 dielectric=mix(lambertian,rawReflectance*specular,F);
  vec3 metal=rawReflectance*diffuse.rgb;

  return mix(dielectric,metal,metallic);
}
#endif

#endif

void main(void)
{
#ifdef WEBGL2
#ifdef NORMAL
  Material m;
#ifdef TRANSPARENT
  m=Materials[abs(MaterialIndex)-1];
  emissive=m.emissive;
  if(MaterialIndex >= 0)
    diffuse=m.diffuse;
  else {
    diffuse=Color;
#if nlights == 0
    emissive += Color;
#endif
  }
#else
  m=Materials[MaterialIndex];
  emissive=m.emissive;
#ifdef COLOR
  diffuse=Color;
#if nlights == 0
    emissive += Color;
#endif
#else
  diffuse=m.diffuse;
#endif // COLOR
#endif // TRANSPARENT
  specular=m.specular.rgb;
  vec4 parameters=m.parameters;
  roughness=1.0-parameters[0];
  metallic=parameters[1];
  fresnel0=parameters[2];
#else
  emissive=Materials[MaterialIndex].emissive;
#endif // NORMAL
#endif // WEBGL2

#if defined(NORMAL) && nlights > 0
  normal=normalize(Normal);
  normal=gl_FrontFacing ? normal : -normal;
#ifdef ORTHOGRAPHIC
  vec3 viewDir=vec3(0.0,0.0,1.0);
#else
  vec3 viewDir=-normalize(ViewPosition);
#endif

vec3 color;
#ifdef USE_IBL
  color=IBLColor(viewDir);
#else
  Roughness2=roughness*roughness;
  color=emissive.rgb;
  for(int i=0; i < nlights; ++i) {
    Light Li=Lights[i];
    vec3 L=Li.direction;
    float cosTheta=max(dot(normal,L),0.0);
    vec3 radiance=cosTheta*Li.color;
    color += BRDF(viewDir,L)*radiance;
  }
#endif
  OUTVALUE=vec4(color,diffuse.a);
#else
  OUTVALUE=emissive;
#endif
}
`;
/**
 * @fileoverview gl-matrix - High performance matrix and vector operations
 * @author Brandon Jones
 * @author Colin MacKenzie IV
 * @version 2.4.0
 */

/* Copyright (c) 2015, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */

(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else {
		var a = factory();
		for(var i in a) (typeof exports === 'object' ? exports : root)[i] = a[i];
	}
})(typeof self !== 'undefined' ? self : this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 1);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.setMatrixArrayType = setMatrixArrayType;
exports.toRadian = toRadian;
exports.equals = equals;
/* Copyright (c) 2015, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */

/**
 * Common utilities
 * @module glMatrix
 */

// Configuration Constants
var EPSILON = exports.EPSILON = 0.000001;
var ARRAY_TYPE = exports.ARRAY_TYPE = typeof Float32Array !== 'undefined' ? Float32Array : Array;
var RANDOM = exports.RANDOM = Math.random;

/**
 * Sets the type of array used when creating new vectors and matrices
 *
 * @param {Type} type Array type, such as Float32Array or Array
 */
function setMatrixArrayType(type) {
  exports.ARRAY_TYPE = ARRAY_TYPE = type;
}

var degree = Math.PI / 180;

/**
 * Convert Degree To Radian
 *
 * @param {Number} a Angle in Degrees
 */
function toRadian(a) {
  return a * degree;
}

/**
 * Tests whether or not the arguments have approximately the same value, within an absolute
 * or relative tolerance of glMatrix.EPSILON (an absolute tolerance is used for values less
 * than or equal to 1.0, and a relative tolerance is used for larger values)
 *
 * @param {Number} a The first number to test.
 * @param {Number} b The second number to test.
 * @returns {Boolean} True if the numbers are approximately equal, false otherwise.
 */
function equals(a, b) {
  return Math.abs(a - b) <= EPSILON * Math.max(1.0, Math.abs(a), Math.abs(b));
}

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.mat4 = exports.mat3 = undefined;

var _mat = __webpack_require__(2);

var mat3 = _interopRequireWildcard(_mat);

var _mat2 = __webpack_require__(3);

var mat4 = _interopRequireWildcard(_mat2);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

/**
 * @fileoverview gl-matrix - High performance matrix and vector operations
 * @author Brandon Jones
 * @author Colin MacKenzie IV
 * @version 2.4.0
 */

/* Copyright (c) 2015, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */
// END HEADER

exports.mat3 = mat3;
exports.mat4 = mat4;

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.create = create;
exports.fromMat4 = fromMat4;
exports.invert = invert;

var _common = __webpack_require__(0);

var glMatrix = _interopRequireWildcard(_common);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

/**
 * 3x3 Matrix
 * @module mat3
 */

/**
 * Creates a new identity mat3
 *
 * @returns {mat3} a new 3x3 matrix
 */
function create() {
  var out = new glMatrix.ARRAY_TYPE(9);
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
  return out;
}

/**
 * Copies the upper-left 3x3 values into the given mat3.
 *
 * @param {mat3} out the receiving 3x3 matrix
 * @param {mat4} a   the source 4x4 matrix
 * @returns {mat3} out
 */
/* Copyright (c) 2015, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */

function fromMat4(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[4];
  out[4] = a[5];
  out[5] = a[6];
  out[6] = a[8];
  out[7] = a[9];
  out[8] = a[10];
  return out;
}

/**
 * Creates a new mat3 initialized with values from an existing matrix
 *
 * @param {mat3} a matrix to clone
 * @returns {mat3} a new 3x3 matrix
 */
function clone(a) {
  var out = new glMatrix.ARRAY_TYPE(9);
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  return out;
}

/**
 * Copy the values from one mat3 to another
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */
function copy(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  return out;
}

/**
 * Create a new mat3 with the given values
 *
 * @param {Number} m00 Component in column 0, row 0 position (index 0)
 * @param {Number} m01 Component in column 0, row 1 position (index 1)
 * @param {Number} m02 Component in column 0, row 2 position (index 2)
 * @param {Number} m10 Component in column 1, row 0 position (index 3)
 * @param {Number} m11 Component in column 1, row 1 position (index 4)
 * @param {Number} m12 Component in column 1, row 2 position (index 5)
 * @param {Number} m20 Component in column 2, row 0 position (index 6)
 * @param {Number} m21 Component in column 2, row 1 position (index 7)
 * @param {Number} m22 Component in column 2, row 2 position (index 8)
 * @returns {mat3} A new mat3
 */
function fromValues(m00, m01, m02, m10, m11, m12, m20, m21, m22) {
  var out = new glMatrix.ARRAY_TYPE(9);
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m10;
  out[4] = m11;
  out[5] = m12;
  out[6] = m20;
  out[7] = m21;
  out[8] = m22;
  return out;
}

/**
 * Set the components of a mat3 to the given values
 *
 * @param {mat3} out the receiving matrix
 * @param {Number} m00 Component in column 0, row 0 position (index 0)
 * @param {Number} m01 Component in column 0, row 1 position (index 1)
 * @param {Number} m02 Component in column 0, row 2 position (index 2)
 * @param {Number} m10 Component in column 1, row 0 position (index 3)
 * @param {Number} m11 Component in column 1, row 1 position (index 4)
 * @param {Number} m12 Component in column 1, row 2 position (index 5)
 * @param {Number} m20 Component in column 2, row 0 position (index 6)
 * @param {Number} m21 Component in column 2, row 1 position (index 7)
 * @param {Number} m22 Component in column 2, row 2 position (index 8)
 * @returns {mat3} out
 */
function set(out, m00, m01, m02, m10, m11, m12, m20, m21, m22) {
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m10;
  out[4] = m11;
  out[5] = m12;
  out[6] = m20;
  out[7] = m21;
  out[8] = m22;
  return out;
}

/**
 * Set a mat3 to the identity matrix
 *
 * @param {mat3} out the receiving matrix
 * @returns {mat3} out
 */
function identity(out) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
  return out;
}

/**
 * Transpose the values of a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */
function transpose(out, a) {
  // If we are transposing ourselves we can skip a few steps but have to cache some values
  if (out === a) {
    var a01 = a[1],
        a02 = a[2],
        a12 = a[5];
    out[1] = a[3];
    out[2] = a[6];
    out[3] = a01;
    out[5] = a[7];
    out[6] = a02;
    out[7] = a12;
  } else {
    out[0] = a[0];
    out[1] = a[3];
    out[2] = a[6];
    out[3] = a[1];
    out[4] = a[4];
    out[5] = a[7];
    out[6] = a[2];
    out[7] = a[5];
    out[8] = a[8];
  }

  return out;
}

/**
 * Inverts a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */
function invert(out, a) {
  var a00 = a[0],
      a01 = a[1],
      a02 = a[2];
  var a10 = a[3],
      a11 = a[4],
      a12 = a[5];
  var a20 = a[6],
      a21 = a[7],
      a22 = a[8];

  var b01 = a22 * a11 - a12 * a21;
  var b11 = -a22 * a10 + a12 * a20;
  var b21 = a21 * a10 - a11 * a20;

  // Calculate the determinant
  var det = a00 * b01 + a01 * b11 + a02 * b21;

  if (!det) {
    return null;
  }
  det = 1.0 / det;

  out[0] = b01 * det;
  out[1] = (-a22 * a01 + a02 * a21) * det;
  out[2] = (a12 * a01 - a02 * a11) * det;
  out[3] = b11 * det;
  out[4] = (a22 * a00 - a02 * a20) * det;
  out[5] = (-a12 * a00 + a02 * a10) * det;
  out[6] = b21 * det;
  out[7] = (-a21 * a00 + a01 * a20) * det;
  out[8] = (a11 * a00 - a01 * a10) * det;
  return out;
}

/**
 * Calculates the adjugate of a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */
function adjoint(out, a) {
  var a00 = a[0],
      a01 = a[1],
      a02 = a[2];
  var a10 = a[3],
      a11 = a[4],
      a12 = a[5];
  var a20 = a[6],
      a21 = a[7],
      a22 = a[8];

  out[0] = a11 * a22 - a12 * a21;
  out[1] = a02 * a21 - a01 * a22;
  out[2] = a01 * a12 - a02 * a11;
  out[3] = a12 * a20 - a10 * a22;
  out[4] = a00 * a22 - a02 * a20;
  out[5] = a02 * a10 - a00 * a12;
  out[6] = a10 * a21 - a11 * a20;
  out[7] = a01 * a20 - a00 * a21;
  out[8] = a00 * a11 - a01 * a10;
  return out;
}

/**
 * Calculates the determinant of a mat3
 *
 * @param {mat3} a the source matrix
 * @returns {Number} determinant of a
 */
function determinant(a) {
  var a00 = a[0],
      a01 = a[1],
      a02 = a[2];
  var a10 = a[3],
      a11 = a[4],
      a12 = a[5];
  var a20 = a[6],
      a21 = a[7],
      a22 = a[8];

  return a00 * (a22 * a11 - a12 * a21) + a01 * (-a22 * a10 + a12 * a20) + a02 * (a21 * a10 - a11 * a20);
}

/**
 * Multiplies two mat3's
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the first operand
 * @param {mat3} b the second operand
 * @returns {mat3} out
 */
function multiply(out, a, b) {
  var a00 = a[0],
      a01 = a[1],
      a02 = a[2];
  var a10 = a[3],
      a11 = a[4],
      a12 = a[5];
  var a20 = a[6],
      a21 = a[7],
      a22 = a[8];

  var b00 = b[0],
      b01 = b[1],
      b02 = b[2];
  var b10 = b[3],
      b11 = b[4],
      b12 = b[5];
  var b20 = b[6],
      b21 = b[7],
      b22 = b[8];

  out[0] = b00 * a00 + b01 * a10 + b02 * a20;
  out[1] = b00 * a01 + b01 * a11 + b02 * a21;
  out[2] = b00 * a02 + b01 * a12 + b02 * a22;

  out[3] = b10 * a00 + b11 * a10 + b12 * a20;
  out[4] = b10 * a01 + b11 * a11 + b12 * a21;
  out[5] = b10 * a02 + b11 * a12 + b12 * a22;

  out[6] = b20 * a00 + b21 * a10 + b22 * a20;
  out[7] = b20 * a01 + b21 * a11 + b22 * a21;
  out[8] = b20 * a02 + b21 * a12 + b22 * a22;
  return out;
}

/**
 * Translate a mat3 by the given vector
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to translate
 * @param {vec2} v vector to translate by
 * @returns {mat3} out
 */
function translate(out, a, v) {
  var a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a10 = a[3],
      a11 = a[4],
      a12 = a[5],
      a20 = a[6],
      a21 = a[7],
      a22 = a[8],
      x = v[0],
      y = v[1];

  out[0] = a00;
  out[1] = a01;
  out[2] = a02;

  out[3] = a10;
  out[4] = a11;
  out[5] = a12;

  out[6] = x * a00 + y * a10 + a20;
  out[7] = x * a01 + y * a11 + a21;
  out[8] = x * a02 + y * a12 + a22;
  return out;
}

/**
 * Rotates a mat3 by the given angle
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat3} out
 */
function rotate(out, a, rad) {
  var a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a10 = a[3],
      a11 = a[4],
      a12 = a[5],
      a20 = a[6],
      a21 = a[7],
      a22 = a[8],
      s = Math.sin(rad),
      c = Math.cos(rad);

  out[0] = c * a00 + s * a10;
  out[1] = c * a01 + s * a11;
  out[2] = c * a02 + s * a12;

  out[3] = c * a10 - s * a00;
  out[4] = c * a11 - s * a01;
  out[5] = c * a12 - s * a02;

  out[6] = a20;
  out[7] = a21;
  out[8] = a22;
  return out;
};

/**
 * Scales the mat3 by the dimensions in the given vec2
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to rotate
 * @param {vec2} v the vec2 to scale the matrix by
 * @returns {mat3} out
 **/
function scale(out, a, v) {
  var x = v[0],
      y = v[1];

  out[0] = x * a[0];
  out[1] = x * a[1];
  out[2] = x * a[2];

  out[3] = y * a[3];
  out[4] = y * a[4];
  out[5] = y * a[5];

  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  return out;
}

exports.scale = scale;

/**
 * Creates a matrix from a vector translation
 * This is equivalent to (but much faster than):
 *
 *     mat3.identity(dest);
 *     mat3.translate(dest, dest, vec);
 *
 * @param {mat3} out mat3 receiving operation result
 * @param {vec2} v Translation vector
 * @returns {mat3} out
 */
function fromTranslation(out, v) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = v[0];
  out[7] = v[1];
  out[8] = 1;
  return out;
}

/**
 * Creates a matrix from a given angle
 * This is equivalent to (but much faster than):
 *
 *     mat3.identity(dest);
 *     mat3.rotate(dest, dest, rad);
 *
 * @param {mat3} out mat3 receiving operation result
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat3} out
 */
function fromRotation(out, rad) {
  var s = Math.sin(rad),
      c = Math.cos(rad);

  out[0] = c;
  out[1] = s;
  out[2] = 0;

  out[3] = -s;
  out[4] = c;
  out[5] = 0;

  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
  return out;
}

/**
 * Creates a matrix from a vector scaling
 * This is equivalent to (but much faster than):
 *
 *     mat3.identity(dest);
 *     mat3.scale(dest, dest, vec);
 *
 * @param {mat3} out mat3 receiving operation result
 * @param {vec2} v Scaling vector
 * @returns {mat3} out
 */
function fromScaling(out, v) {
  out[0] = v[0];
  out[1] = 0;
  out[2] = 0;

  out[3] = 0;
  out[4] = v[1];
  out[5] = 0;

  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
  return out;
}

/**
 * Copies the values from a mat2d into a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat2d} a the matrix to copy
 * @returns {mat3} out
 **/
function fromMat2d(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = 0;

  out[3] = a[2];
  out[4] = a[3];
  out[5] = 0;

  out[6] = a[4];
  out[7] = a[5];
  out[8] = 1;
  return out;
}

/**
* Calculates a 3x3 matrix from the given quaternion
*
* @param {mat3} out mat3 receiving operation result
* @param {quat} q Quaternion to create matrix from
*
* @returns {mat3} out
*/
function fromQuat(out, q) {
  var x = q[0],
      y = q[1],
      z = q[2],
      w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;

  var xx = x * x2;
  var yx = y * x2;
  var yy = y * y2;
  var zx = z * x2;
  var zy = z * y2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;

  out[0] = 1 - yy - zz;
  out[3] = yx - wz;
  out[6] = zx + wy;

  out[1] = yx + wz;
  out[4] = 1 - xx - zz;
  out[7] = zy - wx;

  out[2] = zx - wy;
  out[5] = zy + wx;
  out[8] = 1 - xx - yy;

  return out;
}

/**
* Calculates a 3x3 normal matrix (transpose inverse) from the 4x4 matrix
*
* @param {mat3} out mat3 receiving operation result
* @param {mat4} a Mat4 to derive the normal matrix from
*
* @returns {mat3} out
*/
function normalFromMat4(out, a) {
  var a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
  var a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
  var a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
  var a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];

  var b00 = a00 * a11 - a01 * a10;
  var b01 = a00 * a12 - a02 * a10;
  var b02 = a00 * a13 - a03 * a10;
  var b03 = a01 * a12 - a02 * a11;
  var b04 = a01 * a13 - a03 * a11;
  var b05 = a02 * a13 - a03 * a12;
  var b06 = a20 * a31 - a21 * a30;
  var b07 = a20 * a32 - a22 * a30;
  var b08 = a20 * a33 - a23 * a30;
  var b09 = a21 * a32 - a22 * a31;
  var b10 = a21 * a33 - a23 * a31;
  var b11 = a22 * a33 - a23 * a32;

  // Calculate the determinant
  var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  if (!det) {
    return null;
  }
  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[2] = (a10 * b10 - a11 * b08 + a13 * b06) * det;

  out[3] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[4] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[5] = (a01 * b08 - a00 * b10 - a03 * b06) * det;

  out[6] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[7] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[8] = (a30 * b04 - a31 * b02 + a33 * b00) * det;

  return out;
}

/**
 * Generates a 2D projection matrix with the given bounds
 *
 * @param {mat3} out mat3 frustum matrix will be written into
 * @param {number} width Width of your gl context
 * @param {number} height Height of gl context
 * @returns {mat3} out
 */
function projection(out, width, height) {
  out[0] = 2 / width;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = -2 / height;
  out[5] = 0;
  out[6] = -1;
  out[7] = 1;
  out[8] = 1;
  return out;
}

/**
 * Returns a string representation of a mat3
 *
 * @param {mat3} a matrix to represent as a string
 * @returns {String} string representation of the matrix
 */
function str(a) {
  return 'mat3(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ', ' + a[4] + ', ' + a[5] + ', ' + a[6] + ', ' + a[7] + ', ' + a[8] + ')';
}

/**
 * Returns Frobenius norm of a mat3
 *
 * @param {mat3} a the matrix to calculate Frobenius norm of
 * @returns {Number} Frobenius norm
 */
function frob(a) {
  return Math.sqrt(Math.pow(a[0], 2) + Math.pow(a[1], 2) + Math.pow(a[2], 2) + Math.pow(a[3], 2) + Math.pow(a[4], 2) + Math.pow(a[5], 2) + Math.pow(a[6], 2) + Math.pow(a[7], 2) + Math.pow(a[8], 2));
}

/**
 * Adds two mat3's
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the first operand
 * @param {mat3} b the second operand
 * @returns {mat3} out
 */
function add(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  out[3] = a[3] + b[3];
  out[4] = a[4] + b[4];
  out[5] = a[5] + b[5];
  out[6] = a[6] + b[6];
  out[7] = a[7] + b[7];
  out[8] = a[8] + b[8];
  return out;
}

/**
 * Subtracts matrix b from matrix a
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the first operand
 * @param {mat3} b the second operand
 * @returns {mat3} out
 */
function subtract(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  out[3] = a[3] - b[3];
  out[4] = a[4] - b[4];
  out[5] = a[5] - b[5];
  out[6] = a[6] - b[6];
  out[7] = a[7] - b[7];
  out[8] = a[8] - b[8];
  return out;
}

/**
 * Multiply each element of the matrix by a scalar.
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to scale
 * @param {Number} b amount to scale the matrix's elements by
 * @returns {mat3} out
 */
function multiplyScalar(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  out[3] = a[3] * b;
  out[4] = a[4] * b;
  out[5] = a[5] * b;
  out[6] = a[6] * b;
  out[7] = a[7] * b;
  out[8] = a[8] * b;
  return out;
}

/**
 * Adds two mat3's after multiplying each element of the second operand by a scalar value.
 *
 * @param {mat3} out the receiving vector
 * @param {mat3} a the first operand
 * @param {mat3} b the second operand
 * @param {Number} scale the amount to scale b's elements by before adding
 * @returns {mat3} out
 */
function multiplyScalarAndAdd(out, a, b, scale) {
  out[0] = a[0] + b[0] * scale;
  out[1] = a[1] + b[1] * scale;
  out[2] = a[2] + b[2] * scale;
  out[3] = a[3] + b[3] * scale;
  out[4] = a[4] + b[4] * scale;
  out[5] = a[5] + b[5] * scale;
  out[6] = a[6] + b[6] * scale;
  out[7] = a[7] + b[7] * scale;
  out[8] = a[8] + b[8] * scale;
  return out;
}

/**
 * Returns whether or not the matrices have exactly the same elements in the same position (when compared with ===)
 *
 * @param {mat3} a The first matrix.
 * @param {mat3} b The second matrix.
 * @returns {Boolean} True if the matrices are equal, false otherwise.
 */
function exactEquals(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5] && a[6] === b[6] && a[7] === b[7] && a[8] === b[8];
}

/**
 * Returns whether or not the matrices have approximately the same elements in the same position.
 *
 * @param {mat3} a The first matrix.
 * @param {mat3} b The second matrix.
 * @returns {Boolean} True if the matrices are equal, false otherwise.
 */
function equals(a, b) {
  var a0 = a[0],
      a1 = a[1],
      a2 = a[2],
      a3 = a[3],
      a4 = a[4],
      a5 = a[5],
      a6 = a[6],
      a7 = a[7],
      a8 = a[8];
  var b0 = b[0],
      b1 = b[1],
      b2 = b[2],
      b3 = b[3],
      b4 = b[4],
      b5 = b[5],
      b6 = b[6],
      b7 = b[7],
      b8 = b[8];
  return Math.abs(a0 - b0) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a0), Math.abs(b0)) && Math.abs(a1 - b1) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a1), Math.abs(b1)) && Math.abs(a2 - b2) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a2), Math.abs(b2)) && Math.abs(a3 - b3) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a3), Math.abs(b3)) && Math.abs(a4 - b4) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a4), Math.abs(b4)) && Math.abs(a5 - b5) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a5), Math.abs(b5)) && Math.abs(a6 - b6) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a6), Math.abs(b6)) && Math.abs(a7 - b7) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a7), Math.abs(b7)) && Math.abs(a8 - b8) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a8), Math.abs(b8));
}

/**
 * Alias for {@link mat3.multiply}
 * @function
 */
var mul = multiply;

/**
 * Alias for {@link mat3.subtract}
 * @function
 */
var sub = subtract;

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.create = create;
exports.identity = identity;
exports.invert = invert;
exports.multiply = multiply;
exports.translate = translate;
exports.rotate = rotate;
exports.fromTranslation = fromTranslation;
exports.fromRotation = fromRotation;
exports.frustum = frustum;
exports.ortho = ortho;
exports.fromValues = fromValues;
exports.transpose = transpose;
exports.fromXRotation = fromXRotation;
exports.fromYRotation = fromYRotation;
exports.fromZRotation = fromZRotation;
exports.copy = copy;
exports.scale = scale;

var _common = __webpack_require__(0);

var glMatrix = _interopRequireWildcard(_common);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

/**
 * 4x4 Matrix
 * @module mat4
 */

/**
 * Creates a new identity mat4
 *
 * @returns {mat4} a new 4x4 matrix
 */
function create() {
  var out = new glMatrix.ARRAY_TYPE(16);
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}

/**
 * Creates a new mat4 initialized with values from an existing matrix
 *
 * @param {mat4} a matrix to clone
 * @returns {mat4} a new 4x4 matrix
 */
/* Copyright (c) 2015, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */

function clone(a) {
  var out = new glMatrix.ARRAY_TYPE(16);
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  out[9] = a[9];
  out[10] = a[10];
  out[11] = a[11];
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];
  return out;
}

/**
 * Copy the values from one mat4 to another
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function copy(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  out[9] = a[9];
  out[10] = a[10];
  out[11] = a[11];
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];
  return out;
}

/**
 * Create a new mat4 with the given values
 *
 * @param {Number} m00 Component in column 0, row 0 position (index 0)
 * @param {Number} m01 Component in column 0, row 1 position (index 1)
 * @param {Number} m02 Component in column 0, row 2 position (index 2)
 * @param {Number} m03 Component in column 0, row 3 position (index 3)
 * @param {Number} m10 Component in column 1, row 0 position (index 4)
 * @param {Number} m11 Component in column 1, row 1 position (index 5)
 * @param {Number} m12 Component in column 1, row 2 position (index 6)
 * @param {Number} m13 Component in column 1, row 3 position (index 7)
 * @param {Number} m20 Component in column 2, row 0 position (index 8)
 * @param {Number} m21 Component in column 2, row 1 position (index 9)
 * @param {Number} m22 Component in column 2, row 2 position (index 10)
 * @param {Number} m23 Component in column 2, row 3 position (index 11)
 * @param {Number} m30 Component in column 3, row 0 position (index 12)
 * @param {Number} m31 Component in column 3, row 1 position (index 13)
 * @param {Number} m32 Component in column 3, row 2 position (index 14)
 * @param {Number} m33 Component in column 3, row 3 position (index 15)
 * @returns {mat4} A new mat4
 */
function fromValues(m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33) {
  var out = new glMatrix.ARRAY_TYPE(16);
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m03;
  out[4] = m10;
  out[5] = m11;
  out[6] = m12;
  out[7] = m13;
  out[8] = m20;
  out[9] = m21;
  out[10] = m22;
  out[11] = m23;
  out[12] = m30;
  out[13] = m31;
  out[14] = m32;
  out[15] = m33;
  return out;
}

/**
 * Set the components of a mat4 to the given values
 *
 * @param {mat4} out the receiving matrix
 * @param {Number} m00 Component in column 0, row 0 position (index 0)
 * @param {Number} m01 Component in column 0, row 1 position (index 1)
 * @param {Number} m02 Component in column 0, row 2 position (index 2)
 * @param {Number} m03 Component in column 0, row 3 position (index 3)
 * @param {Number} m10 Component in column 1, row 0 position (index 4)
 * @param {Number} m11 Component in column 1, row 1 position (index 5)
 * @param {Number} m12 Component in column 1, row 2 position (index 6)
 * @param {Number} m13 Component in column 1, row 3 position (index 7)
 * @param {Number} m20 Component in column 2, row 0 position (index 8)
 * @param {Number} m21 Component in column 2, row 1 position (index 9)
 * @param {Number} m22 Component in column 2, row 2 position (index 10)
 * @param {Number} m23 Component in column 2, row 3 position (index 11)
 * @param {Number} m30 Component in column 3, row 0 position (index 12)
 * @param {Number} m31 Component in column 3, row 1 position (index 13)
 * @param {Number} m32 Component in column 3, row 2 position (index 14)
 * @param {Number} m33 Component in column 3, row 3 position (index 15)
 * @returns {mat4} out
 */
function set(out, m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33) {
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m03;
  out[4] = m10;
  out[5] = m11;
  out[6] = m12;
  out[7] = m13;
  out[8] = m20;
  out[9] = m21;
  out[10] = m22;
  out[11] = m23;
  out[12] = m30;
  out[13] = m31;
  out[14] = m32;
  out[15] = m33;
  return out;
}

/**
 * Set a mat4 to the identity matrix
 *
 * @param {mat4} out the receiving matrix
 * @returns {mat4} out
 */
function identity(out) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}

/**
 * Transpose the values of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function transpose(out, a) {
  // If we are transposing ourselves we can skip a few steps but have to cache some values
  if (out === a) {
    var a01 = a[1],
        a02 = a[2],
        a03 = a[3];
    var a12 = a[6],
        a13 = a[7];
    var a23 = a[11];

    out[1] = a[4];
    out[2] = a[8];
    out[3] = a[12];
    out[4] = a01;
    out[6] = a[9];
    out[7] = a[13];
    out[8] = a02;
    out[9] = a12;
    out[11] = a[14];
    out[12] = a03;
    out[13] = a13;
    out[14] = a23;
  } else {
    out[0] = a[0];
    out[1] = a[4];
    out[2] = a[8];
    out[3] = a[12];
    out[4] = a[1];
    out[5] = a[5];
    out[6] = a[9];
    out[7] = a[13];
    out[8] = a[2];
    out[9] = a[6];
    out[10] = a[10];
    out[11] = a[14];
    out[12] = a[3];
    out[13] = a[7];
    out[14] = a[11];
    out[15] = a[15];
  }

  return out;
}

/**
 * Inverts a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function invert(out, a) {
  var a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
  var a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
  var a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
  var a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];

  var b00 = a00 * a11 - a01 * a10;
  var b01 = a00 * a12 - a02 * a10;
  var b02 = a00 * a13 - a03 * a10;
  var b03 = a01 * a12 - a02 * a11;
  var b04 = a01 * a13 - a03 * a11;
  var b05 = a02 * a13 - a03 * a12;
  var b06 = a20 * a31 - a21 * a30;
  var b07 = a20 * a32 - a22 * a30;
  var b08 = a20 * a33 - a23 * a30;
  var b09 = a21 * a32 - a22 * a31;
  var b10 = a21 * a33 - a23 * a31;
  var b11 = a22 * a33 - a23 * a32;

  // Calculate the determinant
  var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  if (!det) {
    return null;
  }
  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

  return out;
}

/**
 * Calculates the adjugate of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function adjoint(out, a) {
  var a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
  var a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
  var a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
  var a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];

  out[0] = a11 * (a22 * a33 - a23 * a32) - a21 * (a12 * a33 - a13 * a32) + a31 * (a12 * a23 - a13 * a22);
  out[1] = -(a01 * (a22 * a33 - a23 * a32) - a21 * (a02 * a33 - a03 * a32) + a31 * (a02 * a23 - a03 * a22));
  out[2] = a01 * (a12 * a33 - a13 * a32) - a11 * (a02 * a33 - a03 * a32) + a31 * (a02 * a13 - a03 * a12);
  out[3] = -(a01 * (a12 * a23 - a13 * a22) - a11 * (a02 * a23 - a03 * a22) + a21 * (a02 * a13 - a03 * a12));
  out[4] = -(a10 * (a22 * a33 - a23 * a32) - a20 * (a12 * a33 - a13 * a32) + a30 * (a12 * a23 - a13 * a22));
  out[5] = a00 * (a22 * a33 - a23 * a32) - a20 * (a02 * a33 - a03 * a32) + a30 * (a02 * a23 - a03 * a22);
  out[6] = -(a00 * (a12 * a33 - a13 * a32) - a10 * (a02 * a33 - a03 * a32) + a30 * (a02 * a13 - a03 * a12));
  out[7] = a00 * (a12 * a23 - a13 * a22) - a10 * (a02 * a23 - a03 * a22) + a20 * (a02 * a13 - a03 * a12);
  out[8] = a10 * (a21 * a33 - a23 * a31) - a20 * (a11 * a33 - a13 * a31) + a30 * (a11 * a23 - a13 * a21);
  out[9] = -(a00 * (a21 * a33 - a23 * a31) - a20 * (a01 * a33 - a03 * a31) + a30 * (a01 * a23 - a03 * a21));
  out[10] = a00 * (a11 * a33 - a13 * a31) - a10 * (a01 * a33 - a03 * a31) + a30 * (a01 * a13 - a03 * a11);
  out[11] = -(a00 * (a11 * a23 - a13 * a21) - a10 * (a01 * a23 - a03 * a21) + a20 * (a01 * a13 - a03 * a11));
  out[12] = -(a10 * (a21 * a32 - a22 * a31) - a20 * (a11 * a32 - a12 * a31) + a30 * (a11 * a22 - a12 * a21));
  out[13] = a00 * (a21 * a32 - a22 * a31) - a20 * (a01 * a32 - a02 * a31) + a30 * (a01 * a22 - a02 * a21);
  out[14] = -(a00 * (a11 * a32 - a12 * a31) - a10 * (a01 * a32 - a02 * a31) + a30 * (a01 * a12 - a02 * a11));
  out[15] = a00 * (a11 * a22 - a12 * a21) - a10 * (a01 * a22 - a02 * a21) + a20 * (a01 * a12 - a02 * a11);
  return out;
}

/**
 * Calculates the determinant of a mat4
 *
 * @param {mat4} a the source matrix
 * @returns {Number} determinant of a
 */
function determinant(a) {
  var a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
  var a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
  var a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
  var a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];

  var b00 = a00 * a11 - a01 * a10;
  var b01 = a00 * a12 - a02 * a10;
  var b02 = a00 * a13 - a03 * a10;
  var b03 = a01 * a12 - a02 * a11;
  var b04 = a01 * a13 - a03 * a11;
  var b05 = a02 * a13 - a03 * a12;
  var b06 = a20 * a31 - a21 * a30;
  var b07 = a20 * a32 - a22 * a30;
  var b08 = a20 * a33 - a23 * a30;
  var b09 = a21 * a32 - a22 * a31;
  var b10 = a21 * a33 - a23 * a31;
  var b11 = a22 * a33 - a23 * a32;

  // Calculate the determinant
  return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
}

/**
 * Multiplies two mat4s
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the first operand
 * @param {mat4} b the second operand
 * @returns {mat4} out
 */
function multiply(out, a, b) {
  var a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
  var a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
  var a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
  var a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];

  // Cache only the current line of the second matrix
  var b0 = b[0],
      b1 = b[1],
      b2 = b[2],
      b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[4];b1 = b[5];b2 = b[6];b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[8];b1 = b[9];b2 = b[10];b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[12];b1 = b[13];b2 = b[14];b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  return out;
}

/**
 * Translate a mat4 by the given vector
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to translate
 * @param {vec3} v vector to translate by
 * @returns {mat4} out
 */
function translate(out, a, v) {
  var x = v[0],
      y = v[1],
      z = v[2];
  var a00 = void 0,
      a01 = void 0,
      a02 = void 0,
      a03 = void 0;
  var a10 = void 0,
      a11 = void 0,
      a12 = void 0,
      a13 = void 0;
  var a20 = void 0,
      a21 = void 0,
      a22 = void 0,
      a23 = void 0;

  if (a === out) {
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
  } else {
    a00 = a[0];a01 = a[1];a02 = a[2];a03 = a[3];
    a10 = a[4];a11 = a[5];a12 = a[6];a13 = a[7];
    a20 = a[8];a21 = a[9];a22 = a[10];a23 = a[11];

    out[0] = a00;out[1] = a01;out[2] = a02;out[3] = a03;
    out[4] = a10;out[5] = a11;out[6] = a12;out[7] = a13;
    out[8] = a20;out[9] = a21;out[10] = a22;out[11] = a23;

    out[12] = a00 * x + a10 * y + a20 * z + a[12];
    out[13] = a01 * x + a11 * y + a21 * z + a[13];
    out[14] = a02 * x + a12 * y + a22 * z + a[14];
    out[15] = a03 * x + a13 * y + a23 * z + a[15];
  }

  return out;
}

/**
 * Scales the mat4 by the dimensions in the given vec3 not using vectorization
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to scale
 * @param {vec3} v the vec3 to scale the matrix by
 * @returns {mat4} out
 **/
function scale(out, a, v) {
  var x = v[0],
      y = v[1],
      z = v[2];

  out[0] = a[0] * x;
  out[1] = a[1] * x;
  out[2] = a[2] * x;
  out[3] = a[3] * x;
  out[4] = a[4] * y;
  out[5] = a[5] * y;
  out[6] = a[6] * y;
  out[7] = a[7] * y;
  out[8] = a[8] * z;
  out[9] = a[9] * z;
  out[10] = a[10] * z;
  out[11] = a[11] * z;
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];
  return out;
}

/**
 * Rotates a mat4 by the given angle around the given axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @param {vec3} axis the axis to rotate around
 * @returns {mat4} out
 */
function rotate(out, a, rad, axis) {
  var x = axis[0],
      y = axis[1],
      z = axis[2];
  var len = Math.sqrt(x * x + y * y + z * z);
  var s = void 0,
      c = void 0,
      t = void 0;
  var a00 = void 0,
      a01 = void 0,
      a02 = void 0,
      a03 = void 0;
  var a10 = void 0,
      a11 = void 0,
      a12 = void 0,
      a13 = void 0;
  var a20 = void 0,
      a21 = void 0,
      a22 = void 0,
      a23 = void 0;
  var b00 = void 0,
      b01 = void 0,
      b02 = void 0;
  var b10 = void 0,
      b11 = void 0,
      b12 = void 0;
  var b20 = void 0,
      b21 = void 0,
      b22 = void 0;

  if (Math.abs(len) < glMatrix.EPSILON) {
    return null;
  }

  len = 1 / len;
  x *= len;
  y *= len;
  z *= len;

  s = Math.sin(rad);
  c = Math.cos(rad);
  t = 1 - c;

  a00 = a[0];a01 = a[1];a02 = a[2];a03 = a[3];
  a10 = a[4];a11 = a[5];a12 = a[6];a13 = a[7];
  a20 = a[8];a21 = a[9];a22 = a[10];a23 = a[11];

  // Construct the elements of the rotation matrix
  b00 = x * x * t + c;b01 = y * x * t + z * s;b02 = z * x * t - y * s;
  b10 = x * y * t - z * s;b11 = y * y * t + c;b12 = z * y * t + x * s;
  b20 = x * z * t + y * s;b21 = y * z * t - x * s;b22 = z * z * t + c;

  // Perform rotation-specific matrix multiplication
  out[0] = a00 * b00 + a10 * b01 + a20 * b02;
  out[1] = a01 * b00 + a11 * b01 + a21 * b02;
  out[2] = a02 * b00 + a12 * b01 + a22 * b02;
  out[3] = a03 * b00 + a13 * b01 + a23 * b02;
  out[4] = a00 * b10 + a10 * b11 + a20 * b12;
  out[5] = a01 * b10 + a11 * b11 + a21 * b12;
  out[6] = a02 * b10 + a12 * b11 + a22 * b12;
  out[7] = a03 * b10 + a13 * b11 + a23 * b12;
  out[8] = a00 * b20 + a10 * b21 + a20 * b22;
  out[9] = a01 * b20 + a11 * b21 + a21 * b22;
  out[10] = a02 * b20 + a12 * b21 + a22 * b22;
  out[11] = a03 * b20 + a13 * b21 + a23 * b22;

  if (a !== out) {
    // If the source and destination differ, copy the unchanged last row
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }
  return out;
}

/**
 * Rotates a matrix by the given angle around the X axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateX(out, a, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  var a10 = a[4];
  var a11 = a[5];
  var a12 = a[6];
  var a13 = a[7];
  var a20 = a[8];
  var a21 = a[9];
  var a22 = a[10];
  var a23 = a[11];

  if (a !== out) {
    // If the source and destination differ, copy the unchanged rows
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }

  // Perform axis-specific matrix multiplication
  out[4] = a10 * c + a20 * s;
  out[5] = a11 * c + a21 * s;
  out[6] = a12 * c + a22 * s;
  out[7] = a13 * c + a23 * s;
  out[8] = a20 * c - a10 * s;
  out[9] = a21 * c - a11 * s;
  out[10] = a22 * c - a12 * s;
  out[11] = a23 * c - a13 * s;
  return out;
}

/**
 * Rotates a matrix by the given angle around the Y axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateY(out, a, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  var a00 = a[0];
  var a01 = a[1];
  var a02 = a[2];
  var a03 = a[3];
  var a20 = a[8];
  var a21 = a[9];
  var a22 = a[10];
  var a23 = a[11];

  if (a !== out) {
    // If the source and destination differ, copy the unchanged rows
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }

  // Perform axis-specific matrix multiplication
  out[0] = a00 * c - a20 * s;
  out[1] = a01 * c - a21 * s;
  out[2] = a02 * c - a22 * s;
  out[3] = a03 * c - a23 * s;
  out[8] = a00 * s + a20 * c;
  out[9] = a01 * s + a21 * c;
  out[10] = a02 * s + a22 * c;
  out[11] = a03 * s + a23 * c;
  return out;
}

/**
 * Rotates a matrix by the given angle around the Z axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateZ(out, a, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  var a00 = a[0];
  var a01 = a[1];
  var a02 = a[2];
  var a03 = a[3];
  var a10 = a[4];
  var a11 = a[5];
  var a12 = a[6];
  var a13 = a[7];

  if (a !== out) {
    // If the source and destination differ, copy the unchanged last row
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }

  // Perform axis-specific matrix multiplication
  out[0] = a00 * c + a10 * s;
  out[1] = a01 * c + a11 * s;
  out[2] = a02 * c + a12 * s;
  out[3] = a03 * c + a13 * s;
  out[4] = a10 * c - a00 * s;
  out[5] = a11 * c - a01 * s;
  out[6] = a12 * c - a02 * s;
  out[7] = a13 * c - a03 * s;
  return out;
}

/**
 * Creates a matrix from a vector translation
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.translate(dest, dest, vec);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {vec3} v Translation vector
 * @returns {mat4} out
 */
function fromTranslation(out, v) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  out[15] = 1;
  return out;
}

/**
 * Creates a matrix from a vector scaling
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.scale(dest, dest, vec);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {vec3} v Scaling vector
 * @returns {mat4} out
 */
function fromScaling(out, v) {
  out[0] = v[0];
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = v[1];
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = v[2];
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}

/**
 * Creates a matrix from a given angle around a given axis
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.rotate(dest, dest, rad, axis);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {Number} rad the angle to rotate the matrix by
 * @param {vec3} axis the axis to rotate around
 * @returns {mat4} out
 */
function fromRotation(out, rad, axis) {
  var x = axis[0],
      y = axis[1],
      z = axis[2];
  var len = Math.sqrt(x * x + y * y + z * z);
  var s = void 0,
      c = void 0,
      t = void 0;

  if (Math.abs(len) < glMatrix.EPSILON) {
    return null;
  }

  len = 1 / len;
  x *= len;
  y *= len;
  z *= len;

  s = Math.sin(rad);
  c = Math.cos(rad);
  t = 1 - c;

  // Perform rotation-specific matrix multiplication
  out[0] = x * x * t + c;
  out[1] = y * x * t + z * s;
  out[2] = z * x * t - y * s;
  out[3] = 0;
  out[4] = x * y * t - z * s;
  out[5] = y * y * t + c;
  out[6] = z * y * t + x * s;
  out[7] = 0;
  out[8] = x * z * t + y * s;
  out[9] = y * z * t - x * s;
  out[10] = z * z * t + c;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}

/**
 * Creates a matrix from the given angle around the X axis
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.rotateX(dest, dest, rad);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function fromXRotation(out, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);

  // Perform axis-specific matrix multiplication
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = c;
  out[6] = s;
  out[7] = 0;
  out[8] = 0;
  out[9] = -s;
  out[10] = c;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}

/**
 * Creates a matrix from the given angle around the Y axis
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.rotateY(dest, dest, rad);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function fromYRotation(out, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);

  // Perform axis-specific matrix multiplication
  out[0] = c;
  out[1] = 0;
  out[2] = -s;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = s;
  out[9] = 0;
  out[10] = c;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}

/**
 * Creates a matrix from the given angle around the Z axis
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.rotateZ(dest, dest, rad);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function fromZRotation(out, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);

  // Perform axis-specific matrix multiplication
  out[0] = c;
  out[1] = s;
  out[2] = 0;
  out[3] = 0;
  out[4] = -s;
  out[5] = c;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}

/**
 * Creates a matrix from a quaternion rotation and vector translation
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.translate(dest, vec);
 *     let quatMat = mat4.create();
 *     quat4.toMat4(quat, quatMat);
 *     mat4.multiply(dest, quatMat);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @param {vec3} v Translation vector
 * @returns {mat4} out
 */
function fromRotationTranslation(out, q, v) {
  // Quaternion math
  var x = q[0],
      y = q[1],
      z = q[2],
      w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;

  var xx = x * x2;
  var xy = x * y2;
  var xz = x * z2;
  var yy = y * y2;
  var yz = y * z2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;

  out[0] = 1 - (yy + zz);
  out[1] = xy + wz;
  out[2] = xz - wy;
  out[3] = 0;
  out[4] = xy - wz;
  out[5] = 1 - (xx + zz);
  out[6] = yz + wx;
  out[7] = 0;
  out[8] = xz + wy;
  out[9] = yz - wx;
  out[10] = 1 - (xx + yy);
  out[11] = 0;
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  out[15] = 1;

  return out;
}

/**
 * Returns the translation vector component of a transformation
 *  matrix. If a matrix is built with fromRotationTranslation,
 *  the returned vector will be the same as the translation vector
 *  originally supplied.
 * @param  {vec3} out Vector to receive translation component
 * @param  {mat4} mat Matrix to be decomposed (input)
 * @return {vec3} out
 */
function getTranslation(out, mat) {
  out[0] = mat[12];
  out[1] = mat[13];
  out[2] = mat[14];

  return out;
}

/**
 * Returns the scaling factor component of a transformation
 *  matrix. If a matrix is built with fromRotationTranslationScale
 *  with a normalized Quaternion paramter, the returned vector will be
 *  the same as the scaling vector
 *  originally supplied.
 * @param  {vec3} out Vector to receive scaling factor component
 * @param  {mat4} mat Matrix to be decomposed (input)
 * @return {vec3} out
 */
function getScaling(out, mat) {
  var m11 = mat[0];
  var m12 = mat[1];
  var m13 = mat[2];
  var m21 = mat[4];
  var m22 = mat[5];
  var m23 = mat[6];
  var m31 = mat[8];
  var m32 = mat[9];
  var m33 = mat[10];

  out[0] = Math.sqrt(m11 * m11 + m12 * m12 + m13 * m13);
  out[1] = Math.sqrt(m21 * m21 + m22 * m22 + m23 * m23);
  out[2] = Math.sqrt(m31 * m31 + m32 * m32 + m33 * m33);

  return out;
}

/**
 * Returns a quaternion representing the rotational component
 *  of a transformation matrix. If a matrix is built with
 *  fromRotationTranslation, the returned quaternion will be the
 *  same as the quaternion originally supplied.
 * @param {quat} out Quaternion to receive the rotation component
 * @param {mat4} mat Matrix to be decomposed (input)
 * @return {quat} out
 */
function getRotation(out, mat) {
  // Algorithm taken from http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToQuaternion/index.htm
  var trace = mat[0] + mat[5] + mat[10];
  var S = 0;

  if (trace > 0) {
    S = Math.sqrt(trace + 1.0) * 2;
    out[3] = 0.25 * S;
    out[0] = (mat[6] - mat[9]) / S;
    out[1] = (mat[8] - mat[2]) / S;
    out[2] = (mat[1] - mat[4]) / S;
  } else if (mat[0] > mat[5] & mat[0] > mat[10]) {
    S = Math.sqrt(1.0 + mat[0] - mat[5] - mat[10]) * 2;
    out[3] = (mat[6] - mat[9]) / S;
    out[0] = 0.25 * S;
    out[1] = (mat[1] + mat[4]) / S;
    out[2] = (mat[8] + mat[2]) / S;
  } else if (mat[5] > mat[10]) {
    S = Math.sqrt(1.0 + mat[5] - mat[0] - mat[10]) * 2;
    out[3] = (mat[8] - mat[2]) / S;
    out[0] = (mat[1] + mat[4]) / S;
    out[1] = 0.25 * S;
    out[2] = (mat[6] + mat[9]) / S;
  } else {
    S = Math.sqrt(1.0 + mat[10] - mat[0] - mat[5]) * 2;
    out[3] = (mat[1] - mat[4]) / S;
    out[0] = (mat[8] + mat[2]) / S;
    out[1] = (mat[6] + mat[9]) / S;
    out[2] = 0.25 * S;
  }

  return out;
}

/**
 * Creates a matrix from a quaternion rotation, vector translation and vector scale
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.translate(dest, vec);
 *     let quatMat = mat4.create();
 *     quat4.toMat4(quat, quatMat);
 *     mat4.multiply(dest, quatMat);
 *     mat4.scale(dest, scale)
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @param {vec3} v Translation vector
 * @param {vec3} s Scaling vector
 * @returns {mat4} out
 */
function fromRotationTranslationScale(out, q, v, s) {
  // Quaternion math
  var x = q[0],
      y = q[1],
      z = q[2],
      w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;

  var xx = x * x2;
  var xy = x * y2;
  var xz = x * z2;
  var yy = y * y2;
  var yz = y * z2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  var sx = s[0];
  var sy = s[1];
  var sz = s[2];

  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;
  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;
  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  out[15] = 1;

  return out;
}

/**
 * Creates a matrix from a quaternion rotation, vector translation and vector scale, rotating and scaling around the given origin
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.translate(dest, vec);
 *     mat4.translate(dest, origin);
 *     let quatMat = mat4.create();
 *     quat4.toMat4(quat, quatMat);
 *     mat4.multiply(dest, quatMat);
 *     mat4.scale(dest, scale)
 *     mat4.translate(dest, negativeOrigin);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @param {vec3} v Translation vector
 * @param {vec3} s Scaling vector
 * @param {vec3} o The origin vector around which to scale and rotate
 * @returns {mat4} out
 */
function fromRotationTranslationScaleOrigin(out, q, v, s, o) {
  // Quaternion math
  var x = q[0],
      y = q[1],
      z = q[2],
      w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;

  var xx = x * x2;
  var xy = x * y2;
  var xz = x * z2;
  var yy = y * y2;
  var yz = y * z2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;

  var sx = s[0];
  var sy = s[1];
  var sz = s[2];

  var ox = o[0];
  var oy = o[1];
  var oz = o[2];

  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;
  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;
  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = v[0] + ox - (out[0] * ox + out[4] * oy + out[8] * oz);
  out[13] = v[1] + oy - (out[1] * ox + out[5] * oy + out[9] * oz);
  out[14] = v[2] + oz - (out[2] * ox + out[6] * oy + out[10] * oz);
  out[15] = 1;

  return out;
}

/**
 * Calculates a 4x4 matrix from the given quaternion
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat} q Quaternion to create matrix from
 *
 * @returns {mat4} out
 */
function fromQuat(out, q) {
  var x = q[0],
      y = q[1],
      z = q[2],
      w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;

  var xx = x * x2;
  var yx = y * x2;
  var yy = y * y2;
  var zx = z * x2;
  var zy = z * y2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;

  out[0] = 1 - yy - zz;
  out[1] = yx + wz;
  out[2] = zx - wy;
  out[3] = 0;

  out[4] = yx - wz;
  out[5] = 1 - xx - zz;
  out[6] = zy + wx;
  out[7] = 0;

  out[8] = zx + wy;
  out[9] = zy - wx;
  out[10] = 1 - xx - yy;
  out[11] = 0;

  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;

  return out;
}

/**
 * Generates a frustum matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {Number} left Left bound of the frustum
 * @param {Number} right Right bound of the frustum
 * @param {Number} bottom Bottom bound of the frustum
 * @param {Number} top Top bound of the frustum
 * @param {Number} near Near bound of the frustum
 * @param {Number} far Far bound of the frustum
 * @returns {mat4} out
 */
function frustum(out, left, right, bottom, top, near, far) {
  var rl = 1 / (right - left);
  var tb = 1 / (top - bottom);
  var nf = 1 / (near - far);
  out[0] = near * 2 * rl;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = near * 2 * tb;
  out[6] = 0;
  out[7] = 0;
  out[8] = (right + left) * rl;
  out[9] = (top + bottom) * tb;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = far * near * 2 * nf;
  out[15] = 0;
  return out;
}

/**
 * Generates a perspective projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} fovy Vertical field of view in radians
 * @param {number} aspect Aspect ratio. typically viewport width/height
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function perspective(out, fovy, aspect, near, far) {
  var f = 1.0 / Math.tan(fovy / 2);
  var nf = 1 / (near - far);
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = 2 * far * near * nf;
  out[15] = 0;
  return out;
}

/**
 * Generates a perspective projection matrix with the given field of view.
 * This is primarily useful for generating projection matrices to be used
 * with the still experiemental WebVR API.
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {Object} fov Object containing the following values: upDegrees, downDegrees, leftDegrees, rightDegrees
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function perspectiveFromFieldOfView(out, fov, near, far) {
  var upTan = Math.tan(fov.upDegrees * Math.PI / 180.0);
  var downTan = Math.tan(fov.downDegrees * Math.PI / 180.0);
  var leftTan = Math.tan(fov.leftDegrees * Math.PI / 180.0);
  var rightTan = Math.tan(fov.rightDegrees * Math.PI / 180.0);
  var xScale = 2.0 / (leftTan + rightTan);
  var yScale = 2.0 / (upTan + downTan);

  out[0] = xScale;
  out[1] = 0.0;
  out[2] = 0.0;
  out[3] = 0.0;
  out[4] = 0.0;
  out[5] = yScale;
  out[6] = 0.0;
  out[7] = 0.0;
  out[8] = -((leftTan - rightTan) * xScale * 0.5);
  out[9] = (upTan - downTan) * yScale * 0.5;
  out[10] = far / (near - far);
  out[11] = -1.0;
  out[12] = 0.0;
  out[13] = 0.0;
  out[14] = far * near / (near - far);
  out[15] = 0.0;
  return out;
}

/**
 * Generates a orthogonal projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} left Left bound of the frustum
 * @param {number} right Right bound of the frustum
 * @param {number} bottom Bottom bound of the frustum
 * @param {number} top Top bound of the frustum
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function ortho(out, left, right, bottom, top, near, far) {
  var lr = 1 / (left - right);
  var bt = 1 / (bottom - top);
  var nf = 1 / (near - far);
  out[0] = -2 * lr;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = -2 * bt;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 2 * nf;
  out[11] = 0;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = (far + near) * nf;
  out[15] = 1;
  return out;
}

/**
 * Generates a look-at matrix with the given eye position, focal point, and up axis
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {vec3} eye Position of the viewer
 * @param {vec3} center Point the viewer is looking at
 * @param {vec3} up vec3 pointing up
 * @returns {mat4} out
 */
function lookAt(out, eye, center, up) {
  var x0 = void 0,
      x1 = void 0,
      x2 = void 0,
      y0 = void 0,
      y1 = void 0,
      y2 = void 0,
      z0 = void 0,
      z1 = void 0,
      z2 = void 0,
      len = void 0;
  var eyex = eye[0];
  var eyey = eye[1];
  var eyez = eye[2];
  var upx = up[0];
  var upy = up[1];
  var upz = up[2];
  var centerx = center[0];
  var centery = center[1];
  var centerz = center[2];

  if (Math.abs(eyex - centerx) < glMatrix.EPSILON && Math.abs(eyey - centery) < glMatrix.EPSILON && Math.abs(eyez - centerz) < glMatrix.EPSILON) {
    return mat4.identity(out);
  }

  z0 = eyex - centerx;
  z1 = eyey - centery;
  z2 = eyez - centerz;

  len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
  z0 *= len;
  z1 *= len;
  z2 *= len;

  x0 = upy * z2 - upz * z1;
  x1 = upz * z0 - upx * z2;
  x2 = upx * z1 - upy * z0;
  len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
  if (!len) {
    x0 = 0;
    x1 = 0;
    x2 = 0;
  } else {
    len = 1 / len;
    x0 *= len;
    x1 *= len;
    x2 *= len;
  }

  y0 = z1 * x2 - z2 * x1;
  y1 = z2 * x0 - z0 * x2;
  y2 = z0 * x1 - z1 * x0;

  len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
  if (!len) {
    y0 = 0;
    y1 = 0;
    y2 = 0;
  } else {
    len = 1 / len;
    y0 *= len;
    y1 *= len;
    y2 *= len;
  }

  out[0] = x0;
  out[1] = y0;
  out[2] = z0;
  out[3] = 0;
  out[4] = x1;
  out[5] = y1;
  out[6] = z1;
  out[7] = 0;
  out[8] = x2;
  out[9] = y2;
  out[10] = z2;
  out[11] = 0;
  out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
  out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
  out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
  out[15] = 1;

  return out;
}

/**
 * Generates a matrix that makes something look at something else.
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {vec3} eye Position of the viewer
 * @param {vec3} center Point the viewer is looking at
 * @param {vec3} up vec3 pointing up
 * @returns {mat4} out
 */
function targetTo(out, eye, target, up) {
  var eyex = eye[0],
      eyey = eye[1],
      eyez = eye[2],
      upx = up[0],
      upy = up[1],
      upz = up[2];

  var z0 = eyex - target[0],
      z1 = eyey - target[1],
      z2 = eyez - target[2];

  var len = z0 * z0 + z1 * z1 + z2 * z2;
  if (len > 0) {
    len = 1 / Math.sqrt(len);
    z0 *= len;
    z1 *= len;
    z2 *= len;
  }

  var x0 = upy * z2 - upz * z1,
      x1 = upz * z0 - upx * z2,
      x2 = upx * z1 - upy * z0;

  out[0] = x0;
  out[1] = x1;
  out[2] = x2;
  out[3] = 0;
  out[4] = z1 * x2 - z2 * x1;
  out[5] = z2 * x0 - z0 * x2;
  out[6] = z0 * x1 - z1 * x0;
  out[7] = 0;
  out[8] = z0;
  out[9] = z1;
  out[10] = z2;
  out[11] = 0;
  out[12] = eyex;
  out[13] = eyey;
  out[14] = eyez;
  out[15] = 1;
  return out;
};

/**
 * Returns a string representation of a mat4
 *
 * @param {mat4} a matrix to represent as a string
 * @returns {String} string representation of the matrix
 */
function str(a) {
  return 'mat4(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ', ' + a[4] + ', ' + a[5] + ', ' + a[6] + ', ' + a[7] + ', ' + a[8] + ', ' + a[9] + ', ' + a[10] + ', ' + a[11] + ', ' + a[12] + ', ' + a[13] + ', ' + a[14] + ', ' + a[15] + ')';
}

/**
 * Returns Frobenius norm of a mat4
 *
 * @param {mat4} a the matrix to calculate Frobenius norm of
 * @returns {Number} Frobenius norm
 */
function frob(a) {
  return Math.sqrt(Math.pow(a[0], 2) + Math.pow(a[1], 2) + Math.pow(a[2], 2) + Math.pow(a[3], 2) + Math.pow(a[4], 2) + Math.pow(a[5], 2) + Math.pow(a[6], 2) + Math.pow(a[7], 2) + Math.pow(a[8], 2) + Math.pow(a[9], 2) + Math.pow(a[10], 2) + Math.pow(a[11], 2) + Math.pow(a[12], 2) + Math.pow(a[13], 2) + Math.pow(a[14], 2) + Math.pow(a[15], 2));
}

/**
 * Adds two mat4's
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the first operand
 * @param {mat4} b the second operand
 * @returns {mat4} out
 */
function add(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  out[3] = a[3] + b[3];
  out[4] = a[4] + b[4];
  out[5] = a[5] + b[5];
  out[6] = a[6] + b[6];
  out[7] = a[7] + b[7];
  out[8] = a[8] + b[8];
  out[9] = a[9] + b[9];
  out[10] = a[10] + b[10];
  out[11] = a[11] + b[11];
  out[12] = a[12] + b[12];
  out[13] = a[13] + b[13];
  out[14] = a[14] + b[14];
  out[15] = a[15] + b[15];
  return out;
}

/**
 * Subtracts matrix b from matrix a
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the first operand
 * @param {mat4} b the second operand
 * @returns {mat4} out
 */
function subtract(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  out[3] = a[3] - b[3];
  out[4] = a[4] - b[4];
  out[5] = a[5] - b[5];
  out[6] = a[6] - b[6];
  out[7] = a[7] - b[7];
  out[8] = a[8] - b[8];
  out[9] = a[9] - b[9];
  out[10] = a[10] - b[10];
  out[11] = a[11] - b[11];
  out[12] = a[12] - b[12];
  out[13] = a[13] - b[13];
  out[14] = a[14] - b[14];
  out[15] = a[15] - b[15];
  return out;
}

/**
 * Multiply each element of the matrix by a scalar.
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to scale
 * @param {Number} b amount to scale the matrix's elements by
 * @returns {mat4} out
 */
function multiplyScalar(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  out[3] = a[3] * b;
  out[4] = a[4] * b;
  out[5] = a[5] * b;
  out[6] = a[6] * b;
  out[7] = a[7] * b;
  out[8] = a[8] * b;
  out[9] = a[9] * b;
  out[10] = a[10] * b;
  out[11] = a[11] * b;
  out[12] = a[12] * b;
  out[13] = a[13] * b;
  out[14] = a[14] * b;
  out[15] = a[15] * b;
  return out;
}

/**
 * Adds two mat4's after multiplying each element of the second operand by a scalar value.
 *
 * @param {mat4} out the receiving vector
 * @param {mat4} a the first operand
 * @param {mat4} b the second operand
 * @param {Number} scale the amount to scale b's elements by before adding
 * @returns {mat4} out
 */
function multiplyScalarAndAdd(out, a, b, scale) {
  out[0] = a[0] + b[0] * scale;
  out[1] = a[1] + b[1] * scale;
  out[2] = a[2] + b[2] * scale;
  out[3] = a[3] + b[3] * scale;
  out[4] = a[4] + b[4] * scale;
  out[5] = a[5] + b[5] * scale;
  out[6] = a[6] + b[6] * scale;
  out[7] = a[7] + b[7] * scale;
  out[8] = a[8] + b[8] * scale;
  out[9] = a[9] + b[9] * scale;
  out[10] = a[10] + b[10] * scale;
  out[11] = a[11] + b[11] * scale;
  out[12] = a[12] + b[12] * scale;
  out[13] = a[13] + b[13] * scale;
  out[14] = a[14] + b[14] * scale;
  out[15] = a[15] + b[15] * scale;
  return out;
}

/**
 * Returns whether or not the matrices have exactly the same elements in the same position (when compared with ===)
 *
 * @param {mat4} a The first matrix.
 * @param {mat4} b The second matrix.
 * @returns {Boolean} True if the matrices are equal, false otherwise.
 */
function exactEquals(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5] && a[6] === b[6] && a[7] === b[7] && a[8] === b[8] && a[9] === b[9] && a[10] === b[10] && a[11] === b[11] && a[12] === b[12] && a[13] === b[13] && a[14] === b[14] && a[15] === b[15];
}

/**
 * Returns whether or not the matrices have approximately the same elements in the same position.
 *
 * @param {mat4} a The first matrix.
 * @param {mat4} b The second matrix.
 * @returns {Boolean} True if the matrices are equal, false otherwise.
 */
function equals(a, b) {
  var a0 = a[0],
      a1 = a[1],
      a2 = a[2],
      a3 = a[3];
  var a4 = a[4],
      a5 = a[5],
      a6 = a[6],
      a7 = a[7];
  var a8 = a[8],
      a9 = a[9],
      a10 = a[10],
      a11 = a[11];
  var a12 = a[12],
      a13 = a[13],
      a14 = a[14],
      a15 = a[15];

  var b0 = b[0],
      b1 = b[1],
      b2 = b[2],
      b3 = b[3];
  var b4 = b[4],
      b5 = b[5],
      b6 = b[6],
      b7 = b[7];
  var b8 = b[8],
      b9 = b[9],
      b10 = b[10],
      b11 = b[11];
  var b12 = b[12],
      b13 = b[13],
      b14 = b[14],
      b15 = b[15];

  return Math.abs(a0 - b0) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a0), Math.abs(b0)) && Math.abs(a1 - b1) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a1), Math.abs(b1)) && Math.abs(a2 - b2) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a2), Math.abs(b2)) && Math.abs(a3 - b3) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a3), Math.abs(b3)) && Math.abs(a4 - b4) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a4), Math.abs(b4)) && Math.abs(a5 - b5) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a5), Math.abs(b5)) && Math.abs(a6 - b6) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a6), Math.abs(b6)) && Math.abs(a7 - b7) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a7), Math.abs(b7)) && Math.abs(a8 - b8) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a8), Math.abs(b8)) && Math.abs(a9 - b9) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a9), Math.abs(b9)) && Math.abs(a10 - b10) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a10), Math.abs(b10)) && Math.abs(a11 - b11) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a11), Math.abs(b11)) && Math.abs(a12 - b12) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a12), Math.abs(b12)) && Math.abs(a13 - b13) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a13), Math.abs(b13)) && Math.abs(a14 - b14) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a14), Math.abs(b14)) && Math.abs(a15 - b15) <= glMatrix.EPSILON * Math.max(1.0, Math.abs(a15), Math.abs(b15));
}





/**
 * Alias for {@link mat4.multiply}
 * @function
 */
var mul = multiply;

/**
 * Alias for {@link mat4.subtract}
 * @function
 */
var sub = subtract;

/***/ })
/******/ ]);
});
// AsyGL library core

(function() {

document.asy={
  canvasWidth:0,
  canvasHeight:0,
  absolute:false, // true: absolute size; false: scale to canvas

  minBound:[0,0,0], // Component-wise minimum bounding box corner
  maxBound:[0,0,0], // Component-wise maximum bounding box corner

  orthographic:false, // true: orthographic; false: perspective
  angleOfView:0,      // Field of view angle
  initialZoom:0,      // Initial zoom

  viewportShift:[0,0],  // Viewport shift (for perspective projection)
  viewportMargin:[0,0], // Margin around viewport

  background:[], // Background color

  zoomFactor:0,      // Zoom base factor
  zoomPinchFactor:0, // Zoom pinch factor
  zoomPinchCap:0,    // Zoom pinch limit
  zoomStep:0,       // Zoom power step

  shiftHoldDistance:0, // Shift-mode maximum hold distance (pixels)
  shiftWaitTime:0,     // Shift-mode hold time (milliseconds)
  vibrateTime:0,       // Shift-mode vibrate time (milliseconds)

  ibl:false,
  webgl2:false,

  imageURL:"",
  image:"",

  // Transformation matrix T[4][4] that maps back to user
  // coordinates, with T[i][j] stored as element 4*i+j.
  Transform:[],

  Centers:[], // Array of billboard centers

  currentObjectName:"",
}

let W=document.asy;

let gl; // WebGL rendering context
let alpha; // Is background opaque?
let embedded; // Is image embedded within another window?
let canvas; // Rendering canvas
let offscreen; // Offscreen rendering canvas for embedded images
let context; // 2D context for copying embedded offscreen images

let P=[]; // Array of Bezier patches, triangles, curves, and pixels
let Lights=[]; // Array of lights
let Materials=[]; // Array of materials

let nlights=0; // Number of lights compiled in shader
let Nmaterials=2; // Maximum number of materials compiled in shader

let materials=[]; // Subset of Materials passed as uniforms
let maxMaterials; // Limit on number of materials allowed in shader

// Initial values:
let canvasWidth0;
let canvasHeight0;
let zoom0;

let halfCanvasWidth,halfCanvasHeight;

const pixelResolution=0.75; // Adaptive rendering constant.
const zoomRemeshFactor=1.5; // Zoom factor before remeshing
const FillFactor=0.1;
const windowTrim=10;
const third=1/3;
const pi=Math.acos(-1.0);
const radians=pi/180.0;
const maxDepth=Math.ceil(1-Math.log2(Number.EPSILON));

let Zoom;
let lastZoom;
let xshift;
let yshift;

let maxViewportWidth;
let maxViewportHeight;

let H; // maximum camera view half-height

let rotMat=mat4.create();
let projMat=mat4.create(); // projection matrix
let viewMat=mat4.create(); // view matrix

let projViewMat=mat4.create(); // projection view matrix
let normMat=mat3.create();
let viewMat3=mat3.create(); // 3x3 view matrix
let cjMatInv=mat4.create();
let Temp=mat4.create();

let gMotionMatrix = mat4.create(); // identity matrix

// Compute inverse of W.Transform using mat4.invert
let gTu2w = mat4.create();  // Create an empty matrix
let gInvTu2w = mat4.create();  // Create an empty matrix

let zmin,zmax;
let center={x:0,y:0,z:0};
let size2;
let ArcballFactor;
let shift={
  x:0,y:0
};

let viewParam = {
  xmin:0,xmax:0,
  ymin:0,ymax:0,
  zmin:0,zmax:0
};

let remesh=true;
let wireframe=0;
let mouseDownOrTouchActive=false;
let lastMouseX=null;
let lastMouseY=null;
let touchID=null;

// Indexed triangles:
let Positions=[];
let Normals=[];
let Colors=[];
let Indices=[];

let IBLReflMap=null;
let IBLDiffuseMap=null;
let IBLbdrfMap=null;

function IBLReady()
{
  return IBLReflMap !== null && IBLDiffuseMap !== null && IBLbdrfMap !== null;
}

function SetIBL()
{
  if(!W.embedded)
    deleteShaders();
  initShaders(W.ibl);
}

let roughnessStepCount=8;

// Assuming the functions from the provided code are available
// axisPoint = [-0.684040286651337, 3, 0.879385241571817]
// axisDirection = [-0.342020143325669, 0, 0.939692620785908]
// alpha = 0.5
function rotateAroundAxis(axisPoint, axisDirection, alpha) {
    // Step 1: Translate the axis to the origin
    const translateToOrigin = mat4.create();
    mat4.translate(translateToOrigin, translateToOrigin, [-axisPoint[0], -axisPoint[1], -axisPoint[2]]);

    // Step 2: Rotate around the axis
    const rotationMatrix = mat4.create();
    mat4.rotate(rotationMatrix, rotationMatrix, alpha, axisDirection);

    // Step 3: Translate back to the original position
    const translateBack = mat4.create();
    mat4.translate(translateBack, translateBack, axisPoint);

    // Step 4: Combine the transformations: T = translateBack * rotationMatrix * translateToOrigin
    const tempMatrix = mat4.create();
    mat4.multiply(tempMatrix, rotationMatrix, translateToOrigin); // rotationMatrix * translateToOrigin
    const finalTransform = mat4.create();
    mat4.multiply(finalTransform, translateBack, tempMatrix); // translateBack * (rotationMatrix * translateToOrigin)

    return finalTransform;
}

class Material {
  constructor(diffuse,emissive,specular,shininess,metallic,fresnel0) {
    this.diffuse=diffuse;
    this.emissive=emissive;
    this.specular=specular;
    this.shininess=shininess;
    this.metallic=metallic;
    this.fresnel0=fresnel0;
  }

  setUniform(program,index) {
    let getLoc=
        param => gl.getUniformLocation(program,"Materials["+index+"]."+param);

    gl.uniform4fv(getLoc("diffuse"),new Float32Array(this.diffuse));
    gl.uniform4fv(getLoc("emissive"),new Float32Array(this.emissive));
    gl.uniform4fv(getLoc("specular"),new Float32Array(this.specular));

    gl.uniform4f(getLoc("parameters"),this.shininess,this.metallic,
                 this.fresnel0,0);
  }
}

let enumPointLight=1;
let enumDirectionalLight=2;

class Light {
  constructor(direction,color) {
    this.direction=direction;
    this.color=color;
  }

  setUniform(program,index) {
    let getLoc=
        param => gl.getUniformLocation(program,"Lights["+index+"]."+param);

    gl.uniform3fv(getLoc("direction"),new Float32Array(this.direction));
    gl.uniform3fv(getLoc("color"),new Float32Array(this.color));
  }
}

function initShaders(ibl=false)
{
  let maxUniforms=gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
  maxMaterials=Math.floor((maxUniforms-14)/4);
  Nmaterials=Math.min(Math.max(Nmaterials,Materials.length),maxMaterials);

  pixelOpt=["WIDTH"];
  materialOpt=["NORMAL"];
  colorOpt=["NORMAL","COLOR"];
  transparentOpt=["NORMAL","COLOR","TRANSPARENT"];

  if(ibl) {
    materialOpt.push('USE_IBL');
    transparentOpt.push('USE_IBL');
  }

  pixelShader=initShader(pixelOpt);
  materialShader=initShader(materialOpt);
  colorShader=initShader(colorOpt);
  transparentShader=initShader(transparentOpt);
}

function deleteShaders()
{
  gl.deleteProgram(transparentShader);
  gl.deleteProgram(colorShader);
  gl.deleteProgram(materialShader);
  gl.deleteProgram(pixelShader);
}

function saveAttributes()
{
  let a=W.webgl2 ?
      window.top.document.asygl2[alpha] :
      window.top.document.asygl[alpha];

  a.gl=gl;
  a.nlights=Lights.length;
  a.Nmaterials=Nmaterials;
  a.maxMaterials=maxMaterials;

  a.pixelShader=pixelShader;
  a.materialShader=materialShader;
  a.colorShader=colorShader;
  a.transparentShader=transparentShader;
}

function restoreAttributes()
{
  let a=W.webgl2 ?
      window.top.document.asygl2[alpha] :
      window.top.document.asygl[alpha];

  gl=a.gl;
  nlights=a.nlights;
  Nmaterials=a.Nmaterials;
  maxMaterials=a.maxMaterials;

  pixelShader=a.pixelShader;
  materialShader=a.materialShader;
  colorShader=a.colorShader;
  transparentShader=a.transparentShader;
}

let indexExt;

function webGL(canvas,alpha) {
  let gl;
  if(W.webgl2) {
    gl=canvas.getContext("webgl2",{alpha: alpha});
    if(W.embedded && !gl) {
      W.webgl2=false;
      W.ibl=false;
      initGL(false);    // Look for an existing webgl context
      return null;      // Skip remainder of parent call
    }
  }
  if(!gl) {
    W.webgl2=false;
    W.ibl=false;
    gl=canvas.getContext("webgl",{alpha: alpha});
  }
  if(!gl)
    alert("Could not initialize WebGL");
  return gl;
}

function initGL(outer=true)
{
  if(W.ibl) W.webgl2=true;

  alpha=W.background[3] < 1;

  if(W.embedded) {
    let p=window.top.document;

    if(outer) context=W.canvas.getContext("2d");
    offscreen=W.webgl2 ? p.offscreen2 : p.offscreen;
    if(!offscreen) {
      offscreen=p.createElement("canvas");
      if(W.webgl2)
        p.offscreen2=offscreen;
      else
        p.offscreen=offscreen;
    }

    if(W.webgl2) {
      if(!p.asygl2)
        p.asygl2=Array(2);
    } else {
      if(!p.asygl)
        p.asygl=Array(2);
    }

    asygl=W.webgl2 ? p.asygl2 : p.asygl;

    if(!asygl[alpha] || !asygl[alpha].gl) {
      rc=webGL(offscreen,alpha);
      if(rc) gl=rc;
      else return;
      initShaders();
      if(W.webgl2)
        p.asygl2[alpha]={};
      else
        p.asygl[alpha]={};
      saveAttributes();
    } else {
      restoreAttributes();
      if((Lights.length != nlights) ||
         Math.min(Materials.length,maxMaterials) > Nmaterials) {
        initShaders();
        saveAttributes();
      }
    }
  } else {
    gl=webGL(W.canvas,alpha);
    initShaders();
  }

  indexExt=gl.getExtension("OES_element_index_uint");

  TRIANGLES=gl.TRIANGLES;
  material0Data=new vertexBuffer(gl.POINTS);
  material1Data=new vertexBuffer(gl.LINES);
  materialData=new vertexBuffer();
  colorData=new vertexBuffer();
  transparentData=new vertexBuffer();
  triangleData=new vertexBuffer();
}

function getShader(gl,shaderScript,type,options=[])
{
  let version=W.webgl2 ? '300 es' : '100';
  let defines=Array(...options)
  let macros=[
    ['nlights',wireframe == 0 ? Lights.length : 0],
    ['Nmaterials',Nmaterials]
  ]

  let consts=[
    ['int','Nlights',Math.max(Lights.length,1)]
  ]

  let addenum=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
  `

  let extensions=[];

  if(W.webgl2)
    defines.push('WEBGL2');

  if(W.ibl)
    macros.push(['ROUGHNESS_STEP_COUNT',roughnessStepCount.toFixed(2)]);

  if(W.orthographic)
    defines.push('ORTHOGRAPHIC');

  macros_str=macros.map(macro => `#define ${macro[0]} ${macro[1]}`).join('\n')
  define_str=defines.map(define => `#define ${define}`).join('\n');
  const_str=consts.map(const_val => `const ${const_val[0]} ${const_val[1]}=${const_val[2]};`).join('\n')
  ext_str=extensions.map(ext => `#extension ${ext}: enable`).join('\n')

  shaderSrc=`#version ${version}
${ext_str}
${define_str}
${const_str}
${macros_str}

${addenum}
${shaderScript}
  `;

  let shader=gl.createShader(type);
  gl.shaderSource(shader,shaderSrc);
  gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function registerBuffer(buffervector,bufferIndex,copy,type=gl.ARRAY_BUFFER)
{
  if(buffervector.length > 0) {
    if(bufferIndex == 0) {
      bufferIndex=gl.createBuffer();
      copy=true;
    }
    gl.bindBuffer(type,bufferIndex);
    if(copy)
      gl.bufferData(type,buffervector,gl.STATIC_DRAW);
  }
  return bufferIndex;
}

function drawBuffer(data,shader,indices=data.indices)
{
  if(data.indices.length == 0) return;

  let normal=shader != pixelShader;

  setUniforms(data,shader);
  if(IBLDiffuseMap != null) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,IBLbdrfMap);
    gl.uniform1i(gl.getUniformLocation(shader,'reflBRDFSampler'),0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,IBLDiffuseMap);
    gl.uniform1i(gl.getUniformLocation(shader,'diffuseSampler'),1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D,IBLReflMap);
    gl.uniform1i(gl.getUniformLocation(shader,'reflImgSampler'),2);
  }

  let copy=remesh || data.partial || !data.rendered;
  data.verticesBuffer=registerBuffer(new Float32Array(data.vertices),
                                     data.verticesBuffer,copy);
  gl.vertexAttribPointer(positionAttribute,3,gl.FLOAT,false,
                         normal ? 24 : 16,0);
  if(normal) {
    if(Lights.length > 0)
      gl.vertexAttribPointer(normalAttribute,3,gl.FLOAT,false,24,12);
  } else
    gl.vertexAttribPointer(widthAttribute,1,gl.FLOAT,false,16,12);

  data.materialsBuffer=registerBuffer(new Int16Array(data.materialIndices),
                                      data.materialsBuffer,copy);
  gl.vertexAttribPointer(materialAttribute,1,gl.SHORT,false,2,0);

  if(shader == colorShader || shader == transparentShader) {
    data.colorsBuffer=registerBuffer(new Float32Array(data.colors),
                                     data.colorsBuffer,copy);
    gl.vertexAttribPointer(colorAttribute,4,gl.FLOAT,true,0,0);
  }

  data.indicesBuffer=registerBuffer(indexExt ? new Uint32Array(indices) :
                                    new Uint16Array(indices),
                                    data.indicesBuffer,copy,
                                    gl.ELEMENT_ARRAY_BUFFER);
  data.rendered=true;

  gl.drawElements(normal ? (wireframe ? gl.LINES : data.type) : gl.POINTS,
                  indices.length,
                  indexExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,0);
  console.log("drawElements() function call: normal], wireframe], data.type], indices.length]", normal, wireframe, data.type, indices.length);
}

let TRIANGLES;

class vertexBuffer {
  constructor(type) {
    this.type=type ? type : TRIANGLES;

    this.verticesBuffer=0;
    this.materialsBuffer=0;
    this.colorsBuffer=0;
    this.indicesBuffer=0;

    this.rendered=false;     // Are all patches in this buffer fully rendered?
    this.partial=false;      // Does buffer contain incomplete data?

    this.clear();
  }

  clear() {
    this.vertices=[];
    this.materialIndices=[];
    this.colors=[];
    this.indices=[];
    this.nvertices=0;
    this.materials=[];
    this.materialTable=[];
  }

  // material vertex
  vertex(v,n) {
    this.vertices.push(v[0]);
    this.vertices.push(v[1]);
    this.vertices.push(v[2]);
    this.vertices.push(n[0]);
    this.vertices.push(n[1]);
    this.vertices.push(n[2]);
    this.materialIndices.push(materialIndex);
    return this.nvertices++;
  }

  // colored vertex
  Vertex(v,n,c=[0,0,0,0]) {
    this.vertices.push(v[0]);
    this.vertices.push(v[1]);
    this.vertices.push(v[2]);
    this.vertices.push(n[0]);
    this.vertices.push(n[1]);
    this.vertices.push(n[2]);
    this.materialIndices.push(materialIndex);
    this.colors.push(c[0]);
    this.colors.push(c[1]);
    this.colors.push(c[2]);
    this.colors.push(c[3]);
    return this.nvertices++;
  }

  // material vertex with width and without normal
  vertex0(v,width) {
    this.vertices.push(v[0]);
    this.vertices.push(v[1]);
    this.vertices.push(v[2]);
    this.vertices.push(width);
    this.materialIndices.push(materialIndex);
    return this.nvertices++;
  }

  // indexed colored vertex
  iVertex(i,v,n,onscreen,c=[0,0,0,0]) {
    let i6=6*i;
    this.vertices[i6]=v[0];
    this.vertices[i6+1]=v[1];
    this.vertices[i6+2]=v[2];
    this.vertices[i6+3]=n[0];
    this.vertices[i6+4]=n[1];
    this.vertices[i6+5]=n[2];
    this.materialIndices[i]=materialIndex;
    let i4=4*i;
    this.colors[i4]=c[0];
    this.colors[i4+1]=c[1];
    this.colors[i4+2]=c[2];
    this.colors[i4+3]=c[3];
    if(onscreen)
      this.indices.push(i);
  }

  append(data) {
    append(this.vertices,data.vertices);
    append(this.materialIndices,data.materialIndices);
    append(this.colors,data.colors);
    appendOffset(this.indices,data.indices,this.nvertices);
    this.nvertices += data.nvertices;
  }
}

let material0Data;    // pixels
let material1Data;    // material Bezier curves
let materialData;     // material Bezier patches & triangles
let colorData;        // colored Bezier patches & triangles
let transparentData;  // transparent patches & triangles
let triangleData;     // opaque indexed triangles

let materialIndex;

// efficiently append array b onto array a
function append(a,b)
{
  let n=a.length;
  let m=b.length;
  a.length += m;
  for(let i=0; i < m; ++i)
    a[n+i]=b[i];
}

// efficiently append array b onto array a with offset
function appendOffset(a,b,o)
{
  let n=a.length;
  let m=b.length;
  a.length += b.length;
  for(let i=0; i < m; ++i)
    a[n+i]=b[i]+o;
}

class Geometry {
  constructor() {
    this.data=new vertexBuffer();
    this.Onscreen=false;
    this.m=[];
      // Local transformation matrix (4x4) - initialized as identity matrix
    this.localTransform = mat4.create();
    this.objectName = W.currentObjectName;
  }

  // Is 2D bounding box formed by projecting 3d points in vector v offscreen?
  offscreen(v) {
    let m=projViewMat;
    let v0=v[0];
    let x=v0[0], y=v0[1], z=v0[2];
    let f=1/(m[3]*x+m[7]*y+m[11]*z+m[15]);
    this.x=this.X=(m[0]*x+m[4]*y+m[8]*z+m[12])*f;
    this.y=this.Y=(m[1]*x+m[5]*y+m[9]*z+m[13])*f;
    for(let i=1, n=v.length; i < n; ++i) {
      let vi=v[i];
      let x=vi[0], y=vi[1], z=vi[2];
      let f=1/(m[3]*x+m[7]*y+m[11]*z+m[15]);
      let X=(m[0]*x+m[4]*y+m[8]*z+m[12])*f;
      let Y=(m[1]*x+m[5]*y+m[9]*z+m[13])*f;
      if(X < this.x) this.x=X;
      else if(X > this.X) this.X=X;
      if(Y < this.y) this.y=Y;
      else if(Y > this.Y) this.Y=Y;
    }
    let eps=1e-2;
    let min=-1-eps;
    let max=1+eps;
    if(this.X < min || this.x > max || this.Y < min || this.y > max) {
      this.Onscreen=false;
      return true;
    }
    return false;
  }

  // T(v) {
    // let c0 = this.c[0];
    // let c1 = this.c[1];
    // let c2 = this.c[2];

    // // Translate vertex relative to the object center
    // let x = v[0] - c0;
    // let y = v[1] - c1;
    // let z = v[2] - c2;
    // let w = 1.0;  // Homogeneous coordinate

    // // Apply localTransform (4×4 matrix)
    // let lx = this.localTransform[0] * x + this.localTransform[4] * y + this.localTransform[8] * z  + this.localTransform[12] * w;
    // let ly = this.localTransform[1] * x + this.localTransform[5] * y + this.localTransform[9] * z  + this.localTransform[13] * w;
    // let lz = this.localTransform[2] * x + this.localTransform[6] * y + this.localTransform[10] * z + this.localTransform[14] * w;

    // // Apply normal transformation matrix
    // return [
        // lx * normMat[0] + ly * normMat[3] + lz * normMat[6] + c0,
        // lx * normMat[1] + ly * normMat[4] + lz * normMat[7] + c1,
        // lx * normMat[2] + ly * normMat[5] + lz * normMat[8] + c2
    // ];
  // }

T(v) {
    // 仅对中心点应用局部变换，用以获取机械臂的平移效果
    let centerTrans = this.localT ? this.localT(this.c) : this.c;

    // 计算原始顶点相对于 label 原始中心 c 的偏移（不经过 localT 旋转）
    let dx = v[0] - this.c[0];
    let dy = v[1] - this.c[1];
    let dz = v[2] - this.c[2];

    // 用 normMat 对偏移进行 billboard 修正，并将偏移加回中心点的位置
    return [
        dx * normMat[0] + dy * normMat[3] + dz * normMat[6] + centerTrans[0],
        dx * normMat[1] + dy * normMat[4] + dz * normMat[7] + centerTrans[1],
        dx * normMat[2] + dy * normMat[5] + dz * normMat[8] + centerTrans[2]
    ];
}


  Tcorners(m,M) {
    return [this.T(m),this.T([m[0],m[1],M[2]]),this.T([m[0],M[1],m[2]]),
            this.T([m[0],M[1],M[2]]),this.T([M[0],m[1],m[2]]),
            this.T([M[0],m[1],M[2]]),this.T([M[0],M[1],m[2]]),this.T(M)];
  }

  setMaterial(data,draw) {
    if(data.materialTable[this.MaterialIndex] == null) {
      if(data.materials.length >= Nmaterials) {
        data.partial=true;
        draw();
      }
      data.materialTable[this.MaterialIndex]=data.materials.length;
      data.materials.push(Materials[this.MaterialIndex]);
    }
    materialIndex=data.materialTable[this.MaterialIndex];
  }

  render() {
    this.setMaterialIndex();

    // First check if re-rendering is required
    let v;
    if(this.CenterIndex == 0)
      v=corners(this.Min,this.Max);
    else {
      this.c=W.Centers[this.CenterIndex-1];
      v=this.Tcorners(this.Min,this.Max);
    }

    if(this.offscreen(v)) { // Fully offscreen
      this.data.clear();
      this.notRendered();
      return;
    }

    let p=this.controlpoints;
    let P;

    if(this.CenterIndex == 0) {
      if(!remesh && this.Onscreen) { // Fully onscreen; no need to re-render
        console.log("render(): calling this.append, remesh, this.Onscreen, but return early", remesh, this.Onscreen);
        this.append();
        return;
      }
      // modify every point's coordinates by local transform matrix
      let n=p.length;
      P=Array(n);
      for(let i=0; i < n; ++i)
        P[i]=this.localT(p[i]);
    } else { // Transform billboard labels
      let n=p.length;
      P=Array(n);
      for(let i=0; i < n; ++i)
        P[i]=this.T(p[i]);
    }

    let s=W.orthographic ? 1 : this.Min[2]/W.maxBound[2];
    let res=pixelResolution*
        Math.hypot(s*(viewParam.xmax-viewParam.xmin),
                   s*(viewParam.ymax-viewParam.ymin))/size2;
    this.res2=res*res;
    this.Epsilon=FillFactor*res;

    this.data.clear();
    this.notRendered();
    this.Onscreen=true;
    console.log("render(): calling this.process(P), which copies data", P);
    this.process(P);
  }

  // asmwarrior, interface to modify the local point position by apply the localTransform matrix
    // Function to modify local transformation matrix
  setLocalTransform(matrix) {
    // this.localTransform = matrix;
    mat4.copy(this.localTransform, matrix);
    // this.data.clear();  // Clear old data
  }
    // modified by asmwarrior
    localT(v) {
        if (!this.localTransform) return v; // No transformation, return original vertex

        if (this.objectName == "link1") return v; // No transformation for link1

        let x = v[0], y = v[1], z = v[2], w = 1.0;

        a = [
            this.localTransform[0] * x + this.localTransform[4] * y + this.localTransform[8] * z +  this.localTransform[12] * w,
            this.localTransform[1] * x + this.localTransform[5] * y + this.localTransform[9] * z +  this.localTransform[13] * w,
            this.localTransform[2] * x + this.localTransform[6] * y + this.localTransform[10] * z + this.localTransform[14] * w
        ];

        return a;
    }
}

function boundPoints(p,m)
{
  let b=p[0];
  let n=p.length;
  for(let i=1; i < n; ++i)
    b=m(b,p[i]);
  return b;
}

class BezierPatch extends Geometry {
  /**
   * Constructor for Bezier Patch
   * @param {*} controlpoints array of 16 control points
   * @param {*} CenterIndex center index of billboard labels (or 0)
   * @param {*} MaterialIndex material index (>= 0)
   * @param {*} colors array of 4 RGBA color arrays
   */
  constructor(controlpoints,CenterIndex,MaterialIndex,color,Min,Max) {
    super();
    this.controlpoints=controlpoints;
    this.CenterIndex=CenterIndex;
    this.MaterialIndex=MaterialIndex;
    this.color=color;
    let n=controlpoints.length;
    if(color) {
      let sum=color[0][3]+color[1][3]+color[2][3];
      this.transparent=(n == 16 || n == 4) ?
                        sum+color[3][3] < 4 : sum < 3;
    } else
      this.transparent=Materials[MaterialIndex].diffuse[3] < 1;

    this.vertex=this.transparent ? this.data.Vertex.bind(this.data) :
      this.data.vertex.bind(this.data);

    let norm2=this.L2norm2(this.controlpoints);
    let fuzz=Math.sqrt(1000*Number.EPSILON*norm2);
    this.epsilon=norm2*Number.EPSILON;

    this.Min=Min ? Min : this.Bounds(this.controlpoints,Math.min,fuzz);
    this.Max=Max ? Max : this.Bounds(this.controlpoints,Math.max,fuzz);
  }

  setMaterialIndex() {
    if(this.transparent)
      this.setMaterial(transparentData,drawTransparent);
    else {
      if(this.color)
        this.setMaterial(colorData,drawColor);
      else
        this.setMaterial(materialData,drawMaterial);
    }
  }

  cornerbound(p,m) {
    let b=m(p[0],p[3]);
    b=m(b,p[12]);
    return m(b,p[15]);
  }

  controlbound(p,m) {
    let b=m(p[1],p[2]);
    b=m(b,p[4]);
    b=m(b,p[5]);
    b=m(b,p[6]);
    b=m(b,p[7]);
    b=m(b,p[8]);
    b=m(b,p[9]);
    b=m(b,p[10]);
    b=m(b,p[11]);
    b=m(b,p[13]);
    return m(b,p[14]);
  }

  bound(p,m,b,fuzz,depth) {
    b=m(b,this.cornerbound(p,m));
    if(m(-1.0,1.0)*(b-this.controlbound(p,m)) >= -fuzz || depth == 0)
      return b;

    --depth;
    fuzz *= 2;

    let c0=new Split(p[0],p[1],p[2],p[3]);
    let c1=new Split(p[4],p[5],p[6],p[7]);
    let c2=new Split(p[8],p[9],p[10],p[11]);
    let c3=new Split(p[12],p[13],p[14],p[15]);

    let c4=new Split(p[0],p[4],p[8],p[12]);
    let c5=new Split(c0.m0,c1.m0,c2.m0,c3.m0);
    let c6=new Split(c0.m3,c1.m3,c2.m3,c3.m3);
    let c7=new Split(c0.m5,c1.m5,c2.m5,c3.m5);
    let c8=new Split(c0.m4,c1.m4,c2.m4,c3.m4);
    let c9=new Split(c0.m2,c1.m2,c2.m2,c3.m2);
    let c10=new Split(p[3],p[7],p[11],p[15]);

    // Check all 4 Bezier subpatches.
    let s0=[p[0],c0.m0,c0.m3,c0.m5,c4.m0,c5.m0,c6.m0,c7.m0,
            c4.m3,c5.m3,c6.m3,c7.m3,c4.m5,c5.m5,c6.m5,c7.m5];
    b=this.bound(s0,m,b,fuzz,depth);
    let s1=[c4.m5,c5.m5,c6.m5,c7.m5,c4.m4,c5.m4,c6.m4,c7.m4,
            c4.m2,c5.m2,c6.m2,c7.m2,p[12],c3.m0,c3.m3,c3.m5];
    b=this.bound(s1,m,b,fuzz,depth);
    let s2=[c7.m5,c8.m5,c9.m5,c10.m5,c7.m4,c8.m4,c9.m4,c10.m4,
            c7.m2,c8.m2,c9.m2,c10.m2,c3.m5,c3.m4,c3.m2,p[15]];
    b=this.bound(s2,m,b,fuzz,depth);
    let s3=[c0.m5,c0.m4,c0.m2,p[3],c7.m0,c8.m0,c9.m0,c10.m0,
            c7.m3,c8.m3,c9.m3,c10.m3,c7.m5,c8.m5,c9.m5,c10.m5];
    return this.bound(s3,m,b,fuzz,depth);
  }

  cornerboundtri(p,m) {
    let b=m(p[0],p[6]);
    return m(b,p[9]);
  }

  controlboundtri(p,m) {
    let b=m(p[1],p[2]);
    b=m(b,p[3]);
    b=m(b,p[4]);
    b=m(b,p[5]);
    b=m(b,p[7]);
    return m(b,p[8]);
  }

  boundtri(p,m,b,fuzz,depth) {
    b=m(b,this.cornerboundtri(p,m));
    if(m(-1.0,1.0)*(b-this.controlboundtri(p,m)) >= -fuzz || depth == 0)
      return b;

    --depth;
    fuzz *= 2;

    let s=new Splittri(p);

    let l=[s.l003,s.l102,s.l012,s.l201,s.l111,
           s.l021,s.l300,s.l210,s.l120,s.l030]; // left
    b=this.boundtri(l,m,b,fuzz,depth);

    let r=[s.l300,s.r102,s.r012,s.r201,s.r111,
           s.r021,s.r300,s.r210,s.r120,s.r030]; // right
    b=this.boundtri(r,m,b,fuzz,depth);

    let u=[s.l030,s.u102,s.u012,s.u201,s.u111,
           s.u021,s.r030,s.u210,s.u120,s.u030]; // up
    b=this.boundtri(u,m,b,fuzz,depth);

    let c=[s.r030,s.u201,s.r021,s.u102,s.c111,
           s.r012,s.l030,s.l120,s.l210,s.l300]; // center
    return this.boundtri(c,m,b,fuzz,depth);
  }

  Bounds(p,m,fuzz) {
    let b=Array(3);
    let n=p.length;
    let x=Array(n);
    for(let i=0; i < 3; ++i) {
      for(let j=0; j < n; ++j)
        x[j]=p[j][i];
      if(n == 16)
        b[i]=this.bound(x,m,x[0],fuzz,maxDepth)
      else if(n == 10)
        b[i]=this.boundtri(x,m,x[0],fuzz,maxDepth);
      else
        b[i]=boundPoints(x,m);
    }
    return [b[0],b[1],b[2]];
  }

// Render a Bezier patch via subdivision.
  L2norm2(p) {
    let p0=p[0];
    let norm2=0;
    let n=p.length;
    for(let i=1; i < n; ++i)
      norm2=Math.max(norm2,abs2([p[i][0]-p0[0],p[i][1]-p0[1],p[i][2]-p0[2]]));
    return norm2;
  }

  processTriangle(p) {
    let p0=p[0];
    let p1=p[1];
    let p2=p[2];
    let n=unit(cross([p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]],
                     [p2[0]-p0[0],p2[1]-p0[1],p2[2]-p0[2]]));
    if(!this.offscreen([p0,p1,p2])) {
      let i0,i1,i2;
      if(this.color) {
        i0=this.data.Vertex(p0,n,this.color[0]);
        i1=this.data.Vertex(p1,n,this.color[1]);
        i2=this.data.Vertex(p2,n,this.color[2]);
      } else {
        i0=this.vertex(p0,n);
        i1=this.vertex(p1,n);
        i2=this.vertex(p2,n);
      }

      if(wireframe == 0) {
        this.data.indices.push(i0);
        this.data.indices.push(i1);
        this.data.indices.push(i2);
      } else {
        this.data.indices.push(i0);
        this.data.indices.push(i1);
        this.data.indices.push(i1);
        this.data.indices.push(i2);
        this.data.indices.push(i2);
        this.data.indices.push(i0);
      }

      this.append();
    }
  }

  processQuad(p) {
    let p0=p[0];
    let p1=p[1];
    let p2=p[2];
    let p3=p[3];
    let n1=cross([p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]],
                 [p2[0]-p1[0],p2[1]-p1[1],p2[2]-p1[2]]);
    let n2=cross([p2[0]-p3[0],p2[1]-p3[1],p2[2]-p3[2]],
                 [p3[0]-p0[0],p3[1]-p0[1],p3[2]-p0[2]]);
    let n=unit([n1[0]+n2[0],n1[1]+n2[1],n1[2]+n2[2]]);
    if(!this.offscreen([p0,p1,p2,p3])) {
      let i0,i1,i2,i3;
      if(this.color) {
        i0=this.data.Vertex(p0,n,this.color[0]);
        i1=this.data.Vertex(p1,n,this.color[1]);
        i2=this.data.Vertex(p2,n,this.color[2]);
        i3=this.data.Vertex(p3,n,this.color[3]);
      } else {
        i0=this.vertex(p0,n);
        i1=this.vertex(p1,n);
        i2=this.vertex(p2,n);
        i3=this.vertex(p3,n);
      }

      if(wireframe == 0) {
        this.data.indices.push(i0);
        this.data.indices.push(i1);
        this.data.indices.push(i2);

        this.data.indices.push(i0);
        this.data.indices.push(i2);
        this.data.indices.push(i3);
      } else {
        this.data.indices.push(i0);
        this.data.indices.push(i1);
        this.data.indices.push(i1);
        this.data.indices.push(i2);
        this.data.indices.push(i2);
        this.data.indices.push(i3);
        this.data.indices.push(i3);
        this.data.indices.push(i0);
      }

      this.append();
    }
  }

  curve(p,a,b,c,d) {
    new BezierCurve([p[a],p[b],p[c],p[d]],0,materialIndex,
                    this.Min,this.Max).render();
  }

  process(p) {
    if(this.transparent && wireframe != 1)
      // Override materialIndex to encode color vs material
      materialIndex=this.color ? -1-materialIndex : 1+materialIndex;

    if(p.length == 10) return this.process3(p);
    if(p.length == 3) return this.processTriangle(p);
    if(p.length == 4) return this.processQuad(p);

    if(wireframe == 1) {
      this.curve(p,0,4,8,12);
      this.curve(p,12,13,14,15);
      this.curve(p,15,11,7,3);
      this.curve(p,3,2,1,0);
      return;
    }

    let p0=p[0];
    let p3=p[3];
    let p12=p[12];
    let p15=p[15];

    let n0=this.normal(p3,p[2],p[1],p0,p[4],p[8],p12);
    if(abs2(n0) < this.epsilon) {
      n0=this.normal(p3,p[2],p[1],p0,p[13],p[14],p15);
      if(abs2(n0) < this.epsilon)
        n0=this.normal(p15,p[11],p[7],p3,p[4],p[8],p12);
    }

    let n1=this.normal(p0,p[4],p[8],p12,p[13],p[14],p15);
    if(abs2(n1) < this.epsilon) {
      n1=this.normal(p0,p[4],p[8],p12,p[11],p[7],p3);
      if(abs2(n1) < this.epsilon)
        n1=this.normal(p3,p[2],p[1],p0,p[13],p[14],p15);
    }

    let n2=this.normal(p12,p[13],p[14],p15,p[11],p[7],p3);
    if(abs2(n2) < this.epsilon) {
      n2=this.normal(p12,p[13],p[14],p15,p[2],p[1],p0);
      if(abs2(n2) < this.epsilon)
        n2=this.normal(p0,p[4],p[8],p12,p[11],p[7],p3);
    }

    let n3=this.normal(p15,p[11],p[7],p3,p[2],p[1],p0);
    if(abs2(n3) < this.epsilon) {
      n3=this.normal(p15,p[11],p[7],p3,p[4],p[8],p12);
      if(abs2(n3) < this.epsilon)
        n3=this.normal(p12,p[13],p[14],p15,p[2],p[1],p0);
    }

    if(this.color) {
      let c0=this.color[0];
      let c1=this.color[1];
      let c2=this.color[2];
      let c3=this.color[3];

      let i0=this.data.Vertex(p0,n0,c0);
      let i1=this.data.Vertex(p12,n1,c1);
      let i2=this.data.Vertex(p15,n2,c2);
      let i3=this.data.Vertex(p3,n3,c3);

      this.Render(p,i0,i1,i2,i3,p0,p12,p15,p3,false,false,false,false,
                  c0,c1,c2,c3);
    } else {
      let i0=this.vertex(p0,n0);
      let i1=this.vertex(p12,n1);
      let i2=this.vertex(p15,n2);
      let i3=this.vertex(p3,n3);

      this.Render(p,i0,i1,i2,i3,p0,p12,p15,p3,false,false,false,false);
    }
    if(this.data.indices.length > 0) this.append();
  }

  append() {
    if(this.transparent)
      transparentData.append(this.data);
    else if(this.color)
      colorData.append(this.data);
    else
      materialData.append(this.data);
  }

  notRendered() {
    if(this.transparent)
      transparentData.rendered=false;
    else if(this.color)
      colorData.rendered=false;
    else
      materialData.rendered=false;
  }

  Render(p,I0,I1,I2,I3,P0,P1,P2,P3,flat0,flat1,flat2,flat3,C0,C1,C2,C3) {
    let d=this.Distance(p);
    if(d[0] < this.res2 && d[1] < this.res2) { // Bezier patch is flat
      if(!this.offscreen([P0,P1,P2])) {
        if(wireframe == 0) {
          this.data.indices.push(I0);
          this.data.indices.push(I1);
          this.data.indices.push(I2);
        } else {
          this.data.indices.push(I0);
          this.data.indices.push(I1);
          this.data.indices.push(I1);
          this.data.indices.push(I2);
        }
      }
      if(!this.offscreen([P0,P2,P3])) {
        if(wireframe == 0) {
          this.data.indices.push(I0);
          this.data.indices.push(I2);
          this.data.indices.push(I3);
        } else {
          this.data.indices.push(I2);
          this.data.indices.push(I3);
          this.data.indices.push(I3);
          this.data.indices.push(I0);
        }
      }
    } else {
  // Approximate bounds by bounding box of control polyhedron.
      if(this.offscreen(p)) return;

      /* Control points are indexed as follows:

       Coordinate
       +-----
        Index

        03    13    23    33
       +-----+-----+-----+
       |3    |7    |11   |15
       |     |     |     |
       |02   |12   |22   |32
       +-----+-----+-----+
       |2    |6    |10   |14
       |     |     |     |
       |01   |11   |21   |31
       +-----+-----+-----+
       |1    |5    |9    |13
       |     |     |     |
       |00   |10   |20   |30
       +-----+-----+-----+
        0     4     8     12

      */

      let p0=p[0];
      let p3=p[3];
      let p12=p[12];
      let p15=p[15];

      if(d[0] < this.res2) { // flat in horizontal direction; split vertically
        /*
       P refers to a corner
       m refers to a midpoint
       s refers to a subpatch

       +--------+--------+
       |P3             P2|
       |                 |
       |       s1        |
       |                 |
       |                 |
    m1 +-----------------+ m0
       |                 |
       |                 |
       |       s0        |
       |                 |
       |P0             P1|
       +-----------------+

        */

        let c0=new Split3(p0,p[1],p[2],p3);
        let c1=new Split3(p[4],p[5],p[6],p[7]);
        let c2=new Split3(p[8],p[9],p[10],p[11]);
        let c3=new Split3(p12,p[13],p[14],p15);

        let s0=[p0  ,c0.m0,c0.m3,c0.m5,
                p[4],c1.m0,c1.m3,c1.m5,
                p[8],c2.m0,c2.m3,c2.m5,
                p12 ,c3.m0,c3.m3,c3.m5];

        let s1=[c0.m5,c0.m4,c0.m2,p3,
                c1.m5,c1.m4,c1.m2,p[7],
                c2.m5,c2.m4,c2.m2,p[11],
                c3.m5,c3.m4,c3.m2,p15];

        let n0=this.normal(s0[12],s0[13],s0[14],s0[15],s0[11],s0[7],s0[3]);
        if(abs2(n0) <= this.epsilon) {
          n0=this.normal(s0[12],s0[13],s0[14],s0[15],s0[2],s0[1],s0[0]);
          if(abs2(n0) <= this.epsilon)
            n0=this.normal(s0[0],s0[4],s0[8],s0[12],s0[11],s0[7],s0[3]);
        }

        let n1=this.normal(s1[3],s1[2],s1[1],s1[0],s1[4],s1[8],s1[12]);
        if(abs2(n1) <= this.epsilon) {
          n1=this.normal(s1[3],s1[2],s1[1],s1[0],s1[13],s1[14],s1[15]);
          if(abs2(n1) <= this.epsilon)
            n1=this.normal(s1[15],s1[11],s1[7],s1[3],s1[4],s1[8],s1[12]);
        }

        let e=this.Epsilon;

        // A kludge to remove subdivision cracks, only applied the first time
        // an edge is found to be flat before the rest of the subpatch is.

        let m0=[0.5*(P1[0]+P2[0]),
                0.5*(P1[1]+P2[1]),
                0.5*(P1[2]+P2[2])];
        if(!flat1) {
          if((flat1=Straightness(p12,p[13],p[14],p15) < this.res2)) {
            let r=unit(this.differential(s1[12],s1[8],s1[4],s1[0]));
            m0=[m0[0]-e*r[0],m0[1]-e*r[1],m0[2]-e*r[2]];
          }
          else m0=s0[15];
        }

        let m1=[0.5*(P3[0]+P0[0]),
                0.5*(P3[1]+P0[1]),
                0.5*(P3[2]+P0[2])];
        if(!flat3) {
          if((flat3=Straightness(p0,p[1],p[2],p3) < this.res2)) {
            let r=unit(this.differential(s0[3],s0[7],s0[11],s0[15]));
            m1=[m1[0]-e*r[0],m1[1]-e*r[1],m1[2]-e*r[2]];
          }
          else m1=s1[0];
        }

        if(C0) {
          let c0=Array(4);
          let c1=Array(4);
          for(let i=0; i < 4; ++i) {
            c0[i]=0.5*(C1[i]+C2[i]);
            c1[i]=0.5*(C3[i]+C0[i]);
          }

          let i0=this.data.Vertex(m0,n0,c0);
          let i1=this.data.Vertex(m1,n1,c1);

          this.Render(s0,I0,I1,i0,i1,P0,P1,m0,m1,flat0,flat1,false,flat3,
                      C0,C1,c0,c1);
          this.Render(s1,i1,i0,I2,I3,m1,m0,P2,P3,false,flat1,flat2,flat3,
                      c1,c0,C2,C3);
        } else {
          let i0=this.vertex(m0,n0);
          let i1=this.vertex(m1,n1);

          this.Render(s0,I0,I1,i0,i1,P0,P1,m0,m1,flat0,flat1,false,flat3);
          this.Render(s1,i1,i0,I2,I3,m1,m0,P2,P3,false,flat1,flat2,flat3);
        }
        return;
      }

      if(d[1] < this.res2) { // flat in vertical direction; split horizontally
        /*
          P refers to a corner
          m refers to a midpoint
          s refers to a subpatch

                   m1
          +--------+--------+
          |P3      |      P2|
          |        |        |
          |        |        |
          |        |        |
          |        |        |
          |   s0   |   s1   |
          |        |        |
          |        |        |
          |        |        |
          |        |        |
          |P0      |      P1|
          +--------+--------+
                   m0

        */

        let c0=new Split3(p0,p[4],p[8],p12);
        let c1=new Split3(p[1],p[5],p[9],p[13]);
        let c2=new Split3(p[2],p[6],p[10],p[14]);
        let c3=new Split3(p3,p[7],p[11],p15);

        let s0=[p0,p[1],p[2],p3,
                c0.m0,c1.m0,c2.m0,c3.m0,
                c0.m3,c1.m3,c2.m3,c3.m3,
                c0.m5,c1.m5,c2.m5,c3.m5];

        let s1=[c0.m5,c1.m5,c2.m5,c3.m5,
                c0.m4,c1.m4,c2.m4,c3.m4,
                c0.m2,c1.m2,c2.m2,c3.m2,
                p12,p[13],p[14],p15];

        let n0=this.normal(s0[0],s0[4],s0[8],s0[12],s0[13],s0[14],s0[15]);
        if(abs2(n0) <= this.epsilon) {
          n0=this.normal(s0[0],s0[4],s0[8],s0[12],s0[11],s0[7],s0[3]);
          if(abs2(n0) <= this.epsilon)
            n0=this.normal(s0[3],s0[2],s0[1],s0[0],s0[13],s0[14],s0[15]);
        }

        let n1=this.normal(s1[15],s1[11],s1[7],s1[3],s1[2],s1[1],s1[0]);
        if(abs2(n1) <= this.epsilon) {
          n1=this.normal(s1[15],s1[11],s1[7],s1[3],s1[4],s1[8],s1[12]);
          if(abs2(n1) <= this.epsilon)
            n1=this.normal(s1[12],s1[13],s1[14],s1[15],s1[2],s1[1],s1[0]);
        }

        let e=this.Epsilon;

        // A kludge to remove subdivision cracks, only applied the first time
        // an edge is found to be flat before the rest of the subpatch is.

        let m0=[0.5*(P0[0]+P1[0]),
                0.5*(P0[1]+P1[1]),
                0.5*(P0[2]+P1[2])];
        if(!flat0) {
          if((flat0=Straightness(p0,p[4],p[8],p12) < this.res2)) {
            let r=unit(this.differential(s1[0],s1[1],s1[2],s1[3]));
            m0=[m0[0]-e*r[0],m0[1]-e*r[1],m0[2]-e*r[2]];
          }
          else m0=s0[12];
        }

        let m1=[0.5*(P2[0]+P3[0]),
                0.5*(P2[1]+P3[1]),
                0.5*(P2[2]+P3[2])];
        if(!flat2) {
          if((flat2=Straightness(p15,p[11],p[7],p3) < this.res2)) {
            let r=unit(this.differential(s0[15],s0[14],s0[13],s0[12]));
            m1=[m1[0]-e*r[0],m1[1]-e*r[1],m1[2]-e*r[2]];
          }
          else m1=s1[3];
        }

        if(C0) {
          let c0=Array(4);
          let c1=Array(4);
          for(let i=0; i < 4; ++i) {
            c0[i]=0.5*(C0[i]+C1[i]);
            c1[i]=0.5*(C2[i]+C3[i]);
          }

          let i0=this.data.Vertex(m0,n0,c0);
          let i1=this.data.Vertex(m1,n1,c1);

          this.Render(s0,I0,i0,i1,I3,P0,m0,m1,P3,flat0,false,flat2,flat3,
                      C0,c0,c1,C3);
          this.Render(s1,i0,I1,I2,i1,m0,P1,P2,m1,flat0,flat1,flat2,false,
                      c0,C1,C2,c1);
        } else {
          let i0=this.vertex(m0,n0);
          let i1=this.vertex(m1,n1);

          this.Render(s0,I0,i0,i1,I3,P0,m0,m1,P3,flat0,false,flat2,flat3);
          this.Render(s1,i0,I1,I2,i1,m0,P1,P2,m1,flat0,flat1,flat2,false);
        }
        return;
      }

      /*
       Horizontal and vertical subdivision:
       P refers to a corner
       m refers to a midpoint
       s refers to a subpatch

                m2
       +--------+--------+
       |P3      |      P2|
       |        |        |
       |   s3   |   s2   |
       |        |        |
       |        | m4     |
    m3 +--------+--------+ m1
       |        |        |
       |        |        |
       |   s0   |   s1   |
       |        |        |
       |P0      |      P1|
       +--------+--------+
                m0
    */

      // Subdivide patch:

      let c0=new Split3(p0,p[1],p[2],p3);
      let c1=new Split3(p[4],p[5],p[6],p[7]);
      let c2=new Split3(p[8],p[9],p[10],p[11]);
      let c3=new Split3(p12,p[13],p[14],p15);

      let c4=new Split3(p0,p[4],p[8],p12);
      let c5=new Split3(c0.m0,c1.m0,c2.m0,c3.m0);
      let c6=new Split3(c0.m3,c1.m3,c2.m3,c3.m3);
      let c7=new Split3(c0.m5,c1.m5,c2.m5,c3.m5);
      let c8=new Split3(c0.m4,c1.m4,c2.m4,c3.m4);
      let c9=new Split3(c0.m2,c1.m2,c2.m2,c3.m2);
      let c10=new Split3(p3,p[7],p[11],p15);

      let s0=[p0,c0.m0,c0.m3,c0.m5,c4.m0,c5.m0,c6.m0,c7.m0,
              c4.m3,c5.m3,c6.m3,c7.m3,c4.m5,c5.m5,c6.m5,c7.m5];
      let s1=[c4.m5,c5.m5,c6.m5,c7.m5,c4.m4,c5.m4,c6.m4,c7.m4,
              c4.m2,c5.m2,c6.m2,c7.m2,p12,c3.m0,c3.m3,c3.m5];
      let s2=[c7.m5,c8.m5,c9.m5,c10.m5,c7.m4,c8.m4,c9.m4,c10.m4,
              c7.m2,c8.m2,c9.m2,c10.m2,c3.m5,c3.m4,c3.m2,p15];
      let s3=[c0.m5,c0.m4,c0.m2,p3,c7.m0,c8.m0,c9.m0,c10.m0,
              c7.m3,c8.m3,c9.m3,c10.m3,c7.m5,c8.m5,c9.m5,c10.m5];

      let m4=s0[15];

      let n0=this.normal(s0[0],s0[4],s0[8],s0[12],s0[13],s0[14],s0[15]);
      if(abs2(n0) < this.epsilon) {
        n0=this.normal(s0[0],s0[4],s0[8],s0[12],s0[11],s0[7],s0[3]);
        if(abs2(n0) < this.epsilon)
          n0=this.normal(s0[3],s0[2],s0[1],s0[0],s0[13],s0[14],s0[15]);
      }

      let n1=this.normal(s1[12],s1[13],s1[14],s1[15],s1[11],s1[7],s1[3]);
      if(abs2(n1) < this.epsilon) {
        n1=this.normal(s1[12],s1[13],s1[14],s1[15],s1[2],s1[1],s1[0]);
        if(abs2(n1) < this.epsilon)
          n1=this.normal(s1[0],s1[4],s1[8],s1[12],s1[11],s1[7],s1[3]);
      }

      let n2=this.normal(s2[15],s2[11],s2[7],s2[3],s2[2],s2[1],s2[0]);
      if(abs2(n2) < this.epsilon) {
        n2=this.normal(s2[15],s2[11],s2[7],s2[3],s2[4],s2[8],s2[12]);
        if(abs2(n2) < this.epsilon)
          n2=this.normal(s2[12],s2[13],s2[14],s2[15],s2[2],s2[1],s2[0]);
      }

      let n3=this.normal(s3[3],s3[2],s3[1],s3[0],s3[4],s3[8],s3[12]);
      if(abs2(n3) < this.epsilon) {
        n3=this.normal(s3[3],s3[2],s3[1],s3[0],s3[13],s3[14],s3[15]);
        if(abs2(n3) < this.epsilon)
          n3=this.normal(s3[15],s3[11],s3[7],s3[3],s3[4],s3[8],s3[12]);
      }

      let n4=this.normal(s2[3],s2[2],s2[1],m4,s2[4],s2[8],s2[12]);

      let e=this.Epsilon;

      // A kludge to remove subdivision cracks, only applied the first time
      // an edge is found to be flat before the rest of the subpatch is.
      let m0=[0.5*(P0[0]+P1[0]),
              0.5*(P0[1]+P1[1]),
              0.5*(P0[2]+P1[2])];
      if(!flat0) {
        if((flat0=Straightness(p0,p[4],p[8],p12) < this.res2)) {
          let r=unit(this.differential(s1[0],s1[1],s1[2],s1[3]));
          m0=[m0[0]-e*r[0],m0[1]-e*r[1],m0[2]-e*r[2]];
        }
        else m0=s0[12];
      }

      let m1=[0.5*(P1[0]+P2[0]),
              0.5*(P1[1]+P2[1]),
              0.5*(P1[2]+P2[2])];
      if(!flat1) {
        if((flat1=Straightness(p12,p[13],p[14],p15) < this.res2)) {
          let r=unit(this.differential(s2[12],s2[8],s2[4],s2[0]));
          m1=[m1[0]-e*r[0],m1[1]-e*r[1],m1[2]-e*r[2]];
        }
        else m1=s1[15];
      }

      let m2=[0.5*(P2[0]+P3[0]),
              0.5*(P2[1]+P3[1]),
              0.5*(P2[2]+P3[2])];
      if(!flat2) {
        if((flat2=Straightness(p15,p[11],p[7],p3) < this.res2)) {
          let r=unit(this.differential(s3[15],s3[14],s3[13],s3[12]));
          m2=[m2[0]-e*r[0],m2[1]-e*r[1],m2[2]-e*r[2]];
        }
        else m2=s2[3];
      }

      let m3=[0.5*(P3[0]+P0[0]),
              0.5*(P3[1]+P0[1]),
              0.5*(P3[2]+P0[2])];
      if(!flat3) {
        if((flat3=Straightness(p0,p[1],p[2],p3) < this.res2)) {
          let r=unit(this.differential(s0[3],s0[7],s0[11],s0[15]));
          m3=[m3[0]-e*r[0],m3[1]-e*r[1],m3[2]-e*r[2]];
        }
        else m3=s3[0];
      }

      if(C0) {
        let c0=Array(4);
        let c1=Array(4);
        let c2=Array(4);
        let c3=Array(4);
        let c4=Array(4);
        for(let i=0; i < 4; ++i) {
          c0[i]=0.5*(C0[i]+C1[i]);
          c1[i]=0.5*(C1[i]+C2[i]);
          c2[i]=0.5*(C2[i]+C3[i]);
          c3[i]=0.5*(C3[i]+C0[i]);
          c4[i]=0.5*(c0[i]+c2[i]);
        }

        let i0=this.data.Vertex(m0,n0,c0);
        let i1=this.data.Vertex(m1,n1,c1);
        let i2=this.data.Vertex(m2,n2,c2);
        let i3=this.data.Vertex(m3,n3,c3);
        let i4=this.data.Vertex(m4,n4,c4);

        this.Render(s0,I0,i0,i4,i3,P0,m0,m4,m3,flat0,false,false,flat3,
                    C0,c0,c4,c3);
        this.Render(s1,i0,I1,i1,i4,m0,P1,m1,m4,flat0,flat1,false,false,
                    c0,C1,c1,c4);
        this.Render(s2,i4,i1,I2,i2,m4,m1,P2,m2,false,flat1,flat2,false,
                    c4,c1,C2,c2);
        this.Render(s3,i3,i4,i2,I3,m3,m4,m2,P3,false,false,flat2,flat3,
                    c3,c4,c2,C3);
      } else {
        let i0=this.vertex(m0,n0);
        let i1=this.vertex(m1,n1);
        let i2=this.vertex(m2,n2);
        let i3=this.vertex(m3,n3);
        let i4=this.vertex(m4,n4);

        this.Render(s0,I0,i0,i4,i3,P0,m0,m4,m3,flat0,false,false,flat3);
        this.Render(s1,i0,I1,i1,i4,m0,P1,m1,m4,flat0,flat1,false,false);
        this.Render(s2,i4,i1,I2,i2,m4,m1,P2,m2,false,flat1,flat2,false);
        this.Render(s3,i3,i4,i2,I3,m3,m4,m2,P3,false,false,flat2,flat3);
      }
    }
  }

// Render a Bezier triangle via subdivision.
  process3(p) {
    if(wireframe == 1) {
      this.curve(p,0,1,3,6);
      this.curve(p,6,7,8,9);
      this.curve(p,9,5,2,0);
      return;
    }

    let p0=p[0];
    let p6=p[6];
    let p9=p[9];

    let n0=this.normal(p9,p[5],p[2],p0,p[1],p[3],p6);
    let n1=this.normal(p0,p[1],p[3],p6,p[7],p[8],p9);
    let n2=this.normal(p6,p[7],p[8],p9,p[5],p[2],p0);

    if(this.color) {
      let c0=this.color[0];
      let c1=this.color[1];
      let c2=this.color[2];

      let i0=this.data.Vertex(p0,n0,c0);
      let i1=this.data.Vertex(p6,n1,c1);
      let i2=this.data.Vertex(p9,n2,c2);

      this.Render3(p,i0,i1,i2,p0,p6,p9,false,false,false,c0,c1,c2);

    } else {
      let i0=this.vertex(p0,n0);
      let i1=this.vertex(p6,n1);
      let i2=this.vertex(p9,n2);

      this.Render3(p,i0,i1,i2,p0,p6,p9,false,false,false);
    }
    if(this.data.indices.length > 0) this.append();
  }

  Render3(p,I0,I1,I2,P0,P1,P2,flat0,flat1,flat2,C0,C1,C2) {
    if(this.Distance3(p) < this.res2) { // Bezier triangle is flat
      if(!this.offscreen([P0,P1,P2])) {
        if(wireframe == 0) {
          this.data.indices.push(I0);
          this.data.indices.push(I1);
          this.data.indices.push(I2);
        } else {
          this.data.indices.push(I0);
          this.data.indices.push(I1);
          this.data.indices.push(I1);
          this.data.indices.push(I2);
          this.data.indices.push(I2);
          this.data.indices.push(I0);
        }
      }
    } else {
  // Approximate bounds by bounding box of control polyhedron.
      if(this.offscreen(p)) return;

    /* Control points are indexed as follows:

       Coordinate
        Index

                                  030
                                   9
                                   /\
                                  /  \
                                 /    \
                                /      \
                               /        \
                          021 +          + 120
                           5 /            \ 8
                            /              \
                           /                \
                          /                  \
                         /                    \
                    012 +          +           + 210
                     2 /          111           \ 7
                      /            4             \
                     /                            \
                    /                              \
                   /                                \
                  /__________________________________\
                003         102           201        300
                 0           1             3          6


       Subdivision:
                                   P2
                                   030
                                   /\
                                  /  \
                                 /    \
                                /      \
                               /        \
                              /    up    \
                             /            \
                            /              \
                        p1 /________________\ p0
                          /\               / \
                         /  \             /   \
                        /    \           /     \
                       /      \  center /       \
                      /        \       /         \
                     /          \     /           \
                    /    left    \   /    right    \
                   /              \ /               \
                  /________________V_________________\
                003               p2                300
                P0                                    P1
    */

      // Subdivide triangle:

      let l003=p[0];
      let p102=p[1];
      let p012=p[2];
      let p201=p[3];
      let p111=p[4];
      let p021=p[5];
      let r300=p[6];
      let p210=p[7];
      let p120=p[8];
      let u030=p[9];

      let u021=[0.5*(u030[0]+p021[0]),
                0.5*(u030[1]+p021[1]),
                0.5*(u030[2]+p021[2])];
      let u120=[0.5*(u030[0]+p120[0]),
                0.5*(u030[1]+p120[1]),
                0.5*(u030[2]+p120[2])];

      let p033=[0.5*(p021[0]+p012[0]),
                0.5*(p021[1]+p012[1]),
                0.5*(p021[2]+p012[2])];
      let p231=[0.5*(p120[0]+p111[0]),
                0.5*(p120[1]+p111[1]),
                0.5*(p120[2]+p111[2])];
      let p330=[0.5*(p120[0]+p210[0]),
                0.5*(p120[1]+p210[1]),
                0.5*(p120[2]+p210[2])];

      let p123=[0.5*(p012[0]+p111[0]),
                0.5*(p012[1]+p111[1]),
                0.5*(p012[2]+p111[2])];

      let l012=[0.5*(p012[0]+l003[0]),
                0.5*(p012[1]+l003[1]),
                0.5*(p012[2]+l003[2])];
      let p312=[0.5*(p111[0]+p201[0]),
                0.5*(p111[1]+p201[1]),
                0.5*(p111[2]+p201[2])];
      let r210=[0.5*(p210[0]+r300[0]),
                0.5*(p210[1]+r300[1]),
                0.5*(p210[2]+r300[2])];

      let l102=[0.5*(l003[0]+p102[0]),
                0.5*(l003[1]+p102[1]),
                0.5*(l003[2]+p102[2])];
      let p303=[0.5*(p102[0]+p201[0]),
                0.5*(p102[1]+p201[1]),
                0.5*(p102[2]+p201[2])];
      let r201=[0.5*(p201[0]+r300[0]),
                0.5*(p201[1]+r300[1]),
                0.5*(p201[2]+r300[2])];

      let u012=[0.5*(u021[0]+p033[0]),
                0.5*(u021[1]+p033[1]),
                0.5*(u021[2]+p033[2])];
      let u210=[0.5*(u120[0]+p330[0]),
                0.5*(u120[1]+p330[1]),
                0.5*(u120[2]+p330[2])];
      let l021=[0.5*(p033[0]+l012[0]),
                0.5*(p033[1]+l012[1]),
                0.5*(p033[2]+l012[2])];
      let p4xx=[0.5*p231[0]+0.25*(p111[0]+p102[0]),
                0.5*p231[1]+0.25*(p111[1]+p102[1]),
                0.5*p231[2]+0.25*(p111[2]+p102[2])];
      let r120=[0.5*(p330[0]+r210[0]),
                0.5*(p330[1]+r210[1]),
                0.5*(p330[2]+r210[2])];
      let px4x=[0.5*p123[0]+0.25*(p111[0]+p210[0]),
                0.5*p123[1]+0.25*(p111[1]+p210[1]),
                0.5*p123[2]+0.25*(p111[2]+p210[2])];
      let pxx4=[0.25*(p021[0]+p111[0])+0.5*p312[0],
                0.25*(p021[1]+p111[1])+0.5*p312[1],
                0.25*(p021[2]+p111[2])+0.5*p312[2]];
      let l201=[0.5*(l102[0]+p303[0]),
                0.5*(l102[1]+p303[1]),
                0.5*(l102[2]+p303[2])];
      let r102=[0.5*(p303[0]+r201[0]),
                0.5*(p303[1]+r201[1]),
                0.5*(p303[2]+r201[2])];

      let l210=[0.5*(px4x[0]+l201[0]),
                0.5*(px4x[1]+l201[1]),
                0.5*(px4x[2]+l201[2])]; // =c120
      let r012=[0.5*(px4x[0]+r102[0]),
                0.5*(px4x[1]+r102[1]),
                0.5*(px4x[2]+r102[2])]; // =c021
      let l300=[0.5*(l201[0]+r102[0]),
                0.5*(l201[1]+r102[1]),
                0.5*(l201[2]+r102[2])]; // =r003=c030

      let r021=[0.5*(pxx4[0]+r120[0]),
                0.5*(pxx4[1]+r120[1]),
                0.5*(pxx4[2]+r120[2])]; // =c012
      let u201=[0.5*(u210[0]+pxx4[0]),
                0.5*(u210[1]+pxx4[1]),
                0.5*(u210[2]+pxx4[2])]; // =c102
      let r030=[0.5*(u210[0]+r120[0]),
                0.5*(u210[1]+r120[1]),
                0.5*(u210[2]+r120[2])]; // =u300=c003

      let u102=[0.5*(u012[0]+p4xx[0]),
                0.5*(u012[1]+p4xx[1]),
                0.5*(u012[2]+p4xx[2])]; // =c201
      let l120=[0.5*(l021[0]+p4xx[0]),
                0.5*(l021[1]+p4xx[1]),
                0.5*(l021[2]+p4xx[2])]; // =c210
      let l030=[0.5*(u012[0]+l021[0]),
                0.5*(u012[1]+l021[1]),
                0.5*(u012[2]+l021[2])]; // =u003=c300

      let l111=[0.5*(p123[0]+l102[0]),
                0.5*(p123[1]+l102[1]),
                0.5*(p123[2]+l102[2])];
      let r111=[0.5*(p312[0]+r210[0]),
                0.5*(p312[1]+r210[1]),
                0.5*(p312[2]+r210[2])];
      let u111=[0.5*(u021[0]+p231[0]),
                0.5*(u021[1]+p231[1]),
                0.5*(u021[2]+p231[2])];
      let c111=[0.25*(p033[0]+p330[0]+p303[0]+p111[0]),
                0.25*(p033[1]+p330[1]+p303[1]+p111[1]),
                0.25*(p033[2]+p330[2]+p303[2]+p111[2])];

      let l=[l003,l102,l012,l201,l111,l021,l300,l210,l120,l030]; // left
      let r=[l300,r102,r012,r201,r111,r021,r300,r210,r120,r030]; // right
      let u=[l030,u102,u012,u201,u111,u021,r030,u210,u120,u030]; // up
      let c=[r030,u201,r021,u102,c111,r012,l030,l120,l210,l300]; // center

      let n0=this.normal(l300,r012,r021,r030,u201,u102,l030);
      let n1=this.normal(r030,u201,u102,l030,l120,l210,l300);
      let n2=this.normal(l030,l120,l210,l300,r012,r021,r030);

      let e=this.Epsilon;

      // A kludge to remove subdivision cracks, only applied the first time
      // an edge is found to be flat before the rest of the subpatch is.

      let m0=[0.5*(P1[0]+P2[0]),
              0.5*(P1[1]+P2[1]),
              0.5*(P1[2]+P2[2])];
      if(!flat0) {
        if((flat0=Straightness(r300,p210,p120,u030) < this.res2)) {
          let r=unit(this.sumdifferential(c[0],c[2],c[5],c[9],c[1],c[3],c[6]));
          m0=[m0[0]-e*r[0],m0[1]-e*r[1],m0[2]-e*r[2]];
        }
        else m0=r030;
      }


      let m1=[0.5*(P2[0]+P0[0]),
              0.5*(P2[1]+P0[1]),
              0.5*(P2[2]+P0[2])];
      if(!flat1) {
        if((flat1=Straightness(l003,p012,p021,u030) < this.res2)) {
          let r=unit(this.sumdifferential(c[6],c[3],c[1],c[0],c[7],c[8],c[9]));
          m1=[m1[0]-e*r[0],m1[1]-e*r[1],m1[2]-e*r[2]];
        }
        else m1=l030;
      }

      let m2=[0.5*(P0[0]+P1[0]),
              0.5*(P0[1]+P1[1]),
              0.5*(P0[2]+P1[2])];
      if(!flat2) {
        if((flat2=Straightness(l003,p102,p201,r300) < this.res2)) {
          let r=unit(this.sumdifferential(c[9],c[8],c[7],c[6],c[5],c[2],c[0]));
          m2=[m2[0]-e*r[0],m2[1]-e*r[1],m2[2]-e*r[2]];
        }
        else m2=l300;
      }

      if(C0) {
        let c0=Array(4);
        let c1=Array(4);
        let c2=Array(4);
        for(let i=0; i < 4; ++i) {
          c0[i]=0.5*(C1[i]+C2[i]);
          c1[i]=0.5*(C2[i]+C0[i]);
          c2[i]=0.5*(C0[i]+C1[i]);
        }

        let i0=this.data.Vertex(m0,n0,c0);
        let i1=this.data.Vertex(m1,n1,c1);
        let i2=this.data.Vertex(m2,n2,c2);

        this.Render3(l,I0,i2,i1,P0,m2,m1,false,flat1,flat2,C0,c2,c1);
        this.Render3(r,i2,I1,i0,m2,P1,m0,flat0,false,flat2,c2,C1,c0);
        this.Render3(u,i1,i0,I2,m1,m0,P2,flat0,flat1,false,c1,c0,C2);
        this.Render3(c,i0,i1,i2,m0,m1,m2,false,false,false,c0,c1,c2);
      } else {
        let i0=this.vertex(m0,n0);
        let i1=this.vertex(m1,n1);
        let i2=this.vertex(m2,n2);

        this.Render3(l,I0,i2,i1,P0,m2,m1,false,flat1,flat2);
        this.Render3(r,i2,I1,i0,m2,P1,m0,flat0,false,flat2);
        this.Render3(u,i1,i0,I2,m1,m0,P2,flat0,flat1,false);
        this.Render3(c,i0,i1,i2,m0,m1,m2,false,false,false);
      }
    }
  }

  // Check the flatness of a Bezier patch
  Distance(p) {
    let p0=p[0];
    let p3=p[3];
    let p12=p[12];
    let p15=p[15];

    // Check the horizontal flatness.
    let h=Flatness(p0,p12,p3,p15);
    // Check straightness of the horizontal edges and interior control curves.
    h=Math.max(h,Straightness(p0,p[4],p[8],p12));
    h=Math.max(h,Straightness(p[1],p[5],p[9],p[13]));
    h=Math.max(h,Straightness(p3,p[7],p[11],p15));
    h=Math.max(h,Straightness(p[2],p[6],p[10],p[14]));

    // Check the vertical flatness.
    let v=Flatness(p0,p3,p12,p15);
    // Check straightness of the vertical edges and interior control curves.
    v=Math.max(v,Straightness(p0,p[1],p[2],p3));
    v=Math.max(v,Straightness(p[4],p[5],p[6],p[7]));
    v=Math.max(v,Straightness(p[8],p[9],p[10],p[11]));
    v=Math.max(v,Straightness(p12,p[13],p[14],p15));

    return [h,v];
  }

  // Check the flatness of a Bezier triangle
  Distance3(p) {
    let p0=p[0];
    let p4=p[4];
    let p6=p[6];
    let p9=p[9];

    // Check how far the internal point is from the centroid of the vertices.
    let d=abs2([(p0[0]+p6[0]+p9[0])*third-p4[0],
                (p0[1]+p6[1]+p9[1])*third-p4[1],
                (p0[2]+p6[2]+p9[2])*third-p4[2]]);

    // Determine how straight the edges are.
    d=Math.max(d,Straightness(p0,p[1],p[3],p6));
    d=Math.max(d,Straightness(p0,p[2],p[5],p9));
    return Math.max(d,Straightness(p6,p[7],p[8],p9));
  }

  // Return the differential of the Bezier curve p0,p1,p2,p3 at 0.
  differential(p0,p1,p2,p3) {
    let p=[3*(p1[0]-p0[0]),3*(p1[1]-p0[1]),3*(p1[2]-p0[2])];
    if(abs2(p) > this.epsilon)
      return p;

    p=bezierPP(p0,p1,p2);
    if(abs2(p) > this.epsilon)
      return p;

    return bezierPPP(p0,p1,p2,p3);
  }

  sumdifferential(p0,p1,p2,p3,p4,p5,p6) {
    let d0=this.differential(p0,p1,p2,p3);
    let d1=this.differential(p0,p4,p5,p6);
    return [d0[0]+d1[0],d0[1]+d1[1],d0[2]+d1[2]];
  }

  normal(left3,left2,left1,middle,right1,right2,right3) {
    let ux=3*(right1[0]-middle[0]);
    let uy=3*(right1[1]-middle[1]);
    let uz=3*(right1[2]-middle[2]);
    let vx=3*(left1[0]-middle[0]);
    let vy=3*(left1[1]-middle[1]);
    let vz=3*(left1[2]-middle[2]);

    let n=[uy*vz-uz*vy,
           uz*vx-ux*vz,
           ux*vy-uy*vx];
    if(abs2(n) > this.epsilon)
      return n;

    let lp=[vx,vy,vz];
    let rp=[ux,uy,uz];

    let lpp=bezierPP(middle,left1,left2);
    let rpp=bezierPP(middle,right1,right2);

    let a=cross(rpp,lp);
    let b=cross(rp,lpp);
    n=[a[0]+b[0],
       a[1]+b[1],
       a[2]+b[2]];
    if(abs2(n) > this.epsilon)
      return n;

    let lppp=bezierPPP(middle,left1,left2,left3);
    let rppp=bezierPPP(middle,right1,right2,right3);

    a=cross(rp,lppp);
    b=cross(rppp,lp);
    let c=cross(rpp,lpp);

    n=[a[0]+b[0]+c[0],
       a[1]+b[1]+c[1],
       a[2]+b[2]+c[2]];
    if(abs2(n) > this.epsilon)
      return n;

    a=cross(rppp,lpp);
    b=cross(rpp,lppp);

    n=[a[0]+b[0],
       a[1]+b[1],
       a[2]+b[2]];
    if(abs2(n) > this.epsilon)
      return n;

    return cross(rppp,lppp);
  }
}

// Calculate the coefficients of a Bezier derivative divided by 3.
function derivative(z0,c0,c1,z1)
{
  let a=z1-z0+3.0*(c0-c1);
  let b=2.0*(z0+c1)-4.0*c0;
  let c=c0-z0;
  return [a,b,c];
}

function goodroot(t)
{
  return 0.0 <= t && t <= 1.0;
}

// Accurate computation of sqrt(1+x)-1.
function sqrt1pxm1(x)
{
  return x/(Math.sqrt(1.0+x)+1.0);
}

// Solve for the real roots of the quadratic equation ax^2+bx+c=0.
class quadraticroots {
  constructor(a,b,c) {
    const Fuzz2=1000*Number.EPSILON;
    const Fuzz4=Fuzz2*Fuzz2;

    // Remove roots at numerical infinity.
    if(Math.abs(a) <= Fuzz2*Math.abs(b)+Fuzz4*Math.abs(c)) {
      if(Math.abs(b) > Fuzz2*Math.abs(c)) {
        this.roots=1;
        this.t1=-c/b;
      } else if(c == 0.0) {
        this.roots=1;
        this.t1=0.0;
      } else {
        this.roots=0;
      }
    } else {
      let factor=0.5*b/a;
      let denom=b*factor;
      if(Math.abs(denom) <= Fuzz2*Math.abs(c)) {
        let x=-c/a;
        if(x >= 0.0) {
          this.roots=2;
          this.t2=Math.sqrt(x);
          this.t1=-this.t2;
        } else
          this.roots=0;
      } else {
        let x=-2.0*c/denom;
        if(x > -1.0) {
          this.roots=2;
          let r2=factor*sqrt1pxm1(x);
          let r1=-r2-2.0*factor;
          if(r1 <= r2) {
            this.t1=r1;
            this.t2=r2;
          } else {
            this.t1=r2;
            this.t2=r1;
          }
        } else if(x == -1.0) {
          this.roots=1;
          this.t1=this.t2=-factor;
        } else
          this.roots=0;
      }
    }
  }
}

class BezierCurve extends Geometry {
  constructor(controlpoints,CenterIndex,MaterialIndex,Min,Max) {
    super();
    this.controlpoints=controlpoints;
    this.CenterIndex=CenterIndex;
    this.MaterialIndex=MaterialIndex;

    if(Min && Max) {
      this.Min=Min;
      this.Max=Max;
    } else {
      let b=this.Bounds(this.controlpoints);
      this.Min=b[0];
      this.Max=b[1];
    }
  }

  Bounds(p) {
    let b=Array(3);
    let B=Array(3);
    let n=p.length;
    let x=Array(n);
    for(let i=0; i < 3; ++i) {
      for(let j=0; j < n; ++j)
        x[j]=p[j][i];
      let m,M;
      m=M=x[0];
      if(n == 4) {
        m=Math.min(m,x[3]);
        M=Math.max(M,x[3]);
        let a=derivative(x[0],x[1],x[2],x[3]);
        let q=new quadraticroots(a[0],a[1],a[2]);
        if(q.roots != 0 && goodroot(q.t1)) {
          let v=bezier(x[0],x[1],x[2],x[3],q.t1);
          m=Math.min(m,v);
          M=Math.max(M,v);
        }
        if(q.roots == 2 && goodroot(q.t2)) {
          let v=bezier(x[0],x[1],x[2],x[3],q.t2);
          m=Math.min(m,v);
          M=Math.max(M,v);
        }
      } else {
        let v=x[1];
        m=Math.min(m,v);
        M=Math.max(M,v);
      }
      b[i]=m;
      B[i]=M;
    }
    return [[b[0],b[1],b[2]],[B[0],B[1],B[2]]];
  }

  setMaterialIndex() {
    this.setMaterial(material1Data,drawMaterial1);
  }

  processLine(p) {
    let p0=p[0];
    let p1=p[1];
    if(!this.offscreen([p0,p1])) {
      let n=[0,0,1];
      this.data.indices.push(this.data.vertex(p0,n));
      this.data.indices.push(this.data.vertex(p1,n));
      this.append();
    }
  }

  process(p) {
    if(p.length == 2) return this.processLine(p);

    let p0=p[0];
    let p1=p[1];
    let p2=p[2];
    let p3=p[3];

    let n0=this.normal(bezierP(p0,p1),bezierPP(p0,p1,p2));
    let n1=this.normal(bezierP(p2,p3),bezierPP(p3,p2,p1));

    let i0=this.data.vertex(p0,n0);
    let i3=this.data.vertex(p3,n1);

    this.Render(p,i0,i3);
    if(this.data.indices.length > 0) this.append();
  }

  append() {
    material1Data.append(this.data);
  }

  notRendered() {
    material1Data.rendered=false;
  }

  Render(p,I0,I1) {
    let p0=p[0];
    let p1=p[1];
    let p2=p[2];
    let p3=p[3];

    if(Straightness(p0,p1,p2,p3) < this.res2) { // Segment is flat
      if(!this.offscreen([p0,p3])) {
        this.data.indices.push(I0);
        this.data.indices.push(I1);
      }
    } else { // Segment is not flat
      if(this.offscreen(p)) return;

      let m0=[0.5*(p0[0]+p1[0]),0.5*(p0[1]+p1[1]),0.5*(p0[2]+p1[2])];
      let m1=[0.5*(p1[0]+p2[0]),0.5*(p1[1]+p2[1]),0.5*(p1[2]+p2[2])];
      let m2=[0.5*(p2[0]+p3[0]),0.5*(p2[1]+p3[1]),0.5*(p2[2]+p3[2])];
      let m3=[0.5*(m0[0]+m1[0]),0.5*(m0[1]+m1[1]),0.5*(m0[2]+m1[2])];
      let m4=[0.5*(m1[0]+m2[0]),0.5*(m1[1]+m2[1]),0.5*(m1[2]+m2[2])];
      let m5=[0.5*(m3[0]+m4[0]),0.5*(m3[1]+m4[1]),0.5*(m3[2]+m4[2])];

      let s0=[p0,m0,m3,m5];
      let s1=[m5,m4,m2,p3];

      let n0=this.normal(bezierPh(p0,p1,p2,p3),bezierPPh(p0,p1,p2,p3));
      let i0=this.data.vertex(m5,n0);

      this.Render(s0,I0,i0);
      this.Render(s1,i0,I1);
    }
  }

  normal(bP,bPP) {
    let bPbP=dot(bP,bP);
    let bPbPP=dot(bP,bPP);
    return [bPbP*bPP[0]-bPbPP*bP[0],
            bPbP*bPP[1]-bPbPP*bP[1],
            bPbP*bPP[2]-bPbPP*bP[2]];
  }
}

class Pixel extends Geometry {
  constructor(controlpoint,width,MaterialIndex) {
    super();
    this.controlpoint=controlpoint;
    this.width=width;
    this.CenterIndex=0;
    this.MaterialIndex=MaterialIndex;
    this.Min=controlpoint;
    this.Max=controlpoint;
  }

  setMaterialIndex() {
    this.setMaterial(material0Data,drawMaterial0);
  }

  process(p) {
    this.data.indices.push(this.data.vertex0(this.controlpoint,this.width));
    this.append();
  }

  append() {
    material0Data.append(this.data);
  }

  notRendered() {
    material0Data.rendered=false;
  }
}

class Triangles extends Geometry {
  constructor(CenterIndex,MaterialIndex) {
    super();
    this.CenterIndex=CenterIndex;
    this.MaterialIndex=MaterialIndex;

    this.controlpoints=window.Positions;
    this.Normals=window.Normals;
    this.Colors=window.Colors;
    this.Indices=window.Indices;
    this.transparent=Materials[this.MaterialIndex].diffuse[3] < 1;

    this.Min=this.Bounds(this.controlpoints,Math.min);
    this.Max=this.Bounds(this.controlpoints,Math.max);
  }

  Bounds(p,m) {
    let b=Array(3);
    let n=p.length;
    let x=Array(n);
    for(let i=0; i < 3; ++i) {
      for(let j=0; j < n; ++j)
        x[j]=p[j][i];
      b[i]=boundPoints(x,m);
    }
    return [b[0],b[1],b[2]];
  }

  setMaterialIndex() {
    if(this.transparent)
      this.setMaterial(transparentData,drawTransparent);
    else
      this.setMaterial(triangleData,drawTriangle);
  }

  process(p) {

    this.data.vertices=new Array(6*p.length);
    // Override materialIndex to encode color vs material
      materialIndex=this.Colors.length > 0 ?
      -1-materialIndex : 1+materialIndex;

    for(let i=0, n=this.Indices.length; i < n; ++i) {
      let index=this.Indices[i];
      let PI=index[0];
      let P0=p[PI[0]];
      let P1=p[PI[1]];
      let P2=p[PI[2]];
      let onscreen=!this.offscreen([P0,P1,P2]);
      let NI=index.length > 1 ? index[1] : PI;
      if(!NI || NI.length == 0) NI=PI;
      if(this.Colors.length > 0) {
        let CI=index.length > 2 ? index[2] : PI;
        if(!CI || CI.length == 0) CI=PI;
        let C0=this.Colors[CI[0]];
        let C1=this.Colors[CI[1]];
        let C2=this.Colors[CI[2]];
        this.transparent |= C0[3]+C1[3]+C2[3] < 3;
        if(wireframe == 0) {
          this.data.iVertex(PI[0],P0,this.Normals[NI[0]],onscreen,C0);
          this.data.iVertex(PI[1],P1,this.Normals[NI[1]],onscreen,C1);
          this.data.iVertex(PI[2],P2,this.Normals[NI[2]],onscreen,C2);
        } else {
          this.data.iVertex(PI[0],P0,this.Normals[NI[0]],onscreen,C0);
          this.data.iVertex(PI[1],P1,this.Normals[NI[1]],onscreen,C1);
          this.data.iVertex(PI[1],P1,this.Normals[NI[1]],onscreen,C1);
          this.data.iVertex(PI[2],P2,this.Normals[NI[2]],onscreen,C2);
          this.data.iVertex(PI[2],P2,this.Normals[NI[2]],onscreen,C2);
          this.data.iVertex(PI[0],P0,this.Normals[NI[0]],onscreen,C0);
        }
      } else {
        if(wireframe == 0) {
          this.data.iVertex(PI[0],P0,this.Normals[NI[0]],onscreen);
          this.data.iVertex(PI[1],P1,this.Normals[NI[1]],onscreen);
          this.data.iVertex(PI[2],P2,this.Normals[NI[2]],onscreen);
        } else {
          this.data.iVertex(PI[0],P0,this.Normals[NI[0]],onscreen);
          this.data.iVertex(PI[1],P1,this.Normals[NI[1]],onscreen);
          this.data.iVertex(PI[1],P1,this.Normals[NI[1]],onscreen);
          this.data.iVertex(PI[2],P2,this.Normals[NI[2]],onscreen);
          this.data.iVertex(PI[2],P2,this.Normals[NI[2]],onscreen);
          this.data.iVertex(PI[0],P0,this.Normals[NI[0]],onscreen);
        }
      }
    }
    this.data.nvertices=p.length;
    if(this.data.indices.length > 0) this.append();
  }

  append() {
    if(this.transparent)
      transparentData.append(this.data);
    else
      triangleData.append(this.data);
  }

  notRendered() {
    if(this.transparent)
      transparentData.rendered=false;
    else
      triangleData.rendered=false;
  }
}

function redrawScene()
{
  initProjection();
  setProjection();
  remesh=true;
  drawScene();
}

function home()
{
  mat4.identity(rotMat);
  redrawScene();

  if(window.top.asyWebApplication)
    window.top.asyWebApplication.setProjection("");
  window.parent.asyProjection=false;
}

let positionAttribute=0;
let normalAttribute=1;
let materialAttribute=2;
let colorAttribute=3;
let widthAttribute=4;

function initShader(options=[])
{
  let vertexShader=getShader(gl,vertex,gl.VERTEX_SHADER,options);
  let fragmentShader=getShader(gl,fragment,gl.FRAGMENT_SHADER,options);
  let shader=gl.createProgram();

  gl.attachShader(shader,vertexShader);
  gl.attachShader(shader,fragmentShader);
  gl.bindAttribLocation(shader,positionAttribute,"position");
  gl.bindAttribLocation(shader,normalAttribute,"normal");
  gl.bindAttribLocation(shader,materialAttribute,"materialIndex");
  gl.bindAttribLocation(shader,colorAttribute,"color");
  gl.bindAttribLocation(shader,widthAttribute,"width");
  gl.linkProgram(shader);
  if(!gl.getProgramParameter(shader,gl.LINK_STATUS))
    alert("Could not initialize shaders");

  return shader;
}

class Split {
  constructor(z0,c0,c1,z1) {
    this.m0=0.5*(z0+c0);
    let m1=0.5*(c0+c1);
    this.m2=0.5*(c1+z1);
    this.m3=0.5*(this.m0+m1);
    this.m4=0.5*(m1+this.m2);
    this.m5=0.5*(this.m3+this.m4);
  }
}

class Split3 {
  constructor(z0,c0,c1,z1) {
    this.m0=[0.5*(z0[0]+c0[0]),0.5*(z0[1]+c0[1]),0.5*(z0[2]+c0[2])];
    let m1_0=0.5*(c0[0]+c1[0]);
    let m1_1=0.5*(c0[1]+c1[1]);
    let m1_2=0.5*(c0[2]+c1[2]);
    this.m2=[0.5*(c1[0]+z1[0]),0.5*(c1[1]+z1[1]),0.5*(c1[2]+z1[2])];
    this.m3=[0.5*(this.m0[0]+m1_0),0.5*(this.m0[1]+m1_1),
             0.5*(this.m0[2]+m1_2)];
    this.m4=[0.5*(m1_0+this.m2[0]),0.5*(m1_1+this.m2[1]),
             0.5*(m1_2+this.m2[2])];
    this.m5=[0.5*(this.m3[0]+this.m4[0]),0.5*(this.m3[1]+this.m4[1]),
             0.5*(this.m3[2]+this.m4[2])];
  }
}

class Splittri {
  constructor(p) {
    this.l003=p[0];
    let p102=p[1];
    let p012=p[2];
    let p201=p[3];
    let p111=p[4];
    let p021=p[5];
    this.r300=p[6];
    let p210=p[7];
    let p120=p[8];
    this.u030=p[9];

    this.u021=0.5*(this.u030+p021);
    this.u120=0.5*(this.u030+p120);

    let p033=0.5*(p021+p012);
    let p231=0.5*(p120+p111);
    let p330=0.5*(p120+p210);

    let p123=0.5*(p012+p111);

    this.l012=0.5*(p012+this.l003);
    let p312=0.5*(p111+p201);
    this.r210=0.5*(p210+this.r300);

    this.l102=0.5*(this.l003+p102);
    let p303=0.5*(p102+p201);
    this.r201=0.5*(p201+this.r300);

    this.u012=0.5*(this.u021+p033);
    this.u210=0.5*(this.u120+p330);
    this.l021=0.5*(p033+this.l012);
    let p4xx=0.5*p231+0.25*(p111+p102);
    this.r120=0.5*(p330+this.r210);
    let px4x=0.5*p123+0.25*(p111+p210);
    let pxx4=0.25*(p021+p111)+0.5*p312;
    this.l201=0.5*(this.l102+p303);
    this.r102=0.5*(p303+this.r201);

    this.l210=0.5*(px4x+this.l201); // = m120
    this.r012=0.5*(px4x+this.r102); // = m021
    this.l300=0.5*(this.l201+this.r102); // = r003 = m030

    this.r021=0.5*(pxx4+this.r120); // = m012
    this.u201=0.5*(this.u210+pxx4); // = m102
    this.r030=0.5*(this.u210+this.r120); // = u300 = m003

    this.u102=0.5*(this.u012+p4xx); // = m201
    this.l120=0.5*(this.l021+p4xx); // = m210
    this.l030=0.5*(this.u012+this.l021); // = u003 = m300

    this.l111=0.5*(p123+this.l102);
    this.r111=0.5*(p312+this.r210);
    this.u111=0.5*(this.u021+p231);
    this.c111=0.25*(p033+p330+p303+p111);
  }
}

function unit(v)
{
  let norm=1/(Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]) || 1);
  return [v[0]*norm,v[1]*norm,v[2]*norm];
}

function abs2(v)
{
  return v[0]*v[0]+v[1]*v[1]+v[2]*v[2];
}

function dot(u,v)
{
  return u[0]*v[0]+u[1]*v[1]+u[2]*v[2];
}

function cross(u,v)
{
  return [u[1]*v[2]-u[2]*v[1],
          u[2]*v[0]-u[0]*v[2],
          u[0]*v[1]-u[1]*v[0]];
}

// Evaluate the Bezier curve defined by a,b,c,d at t.
function bezier(a,b,c,d,t)
{
  let onemt=1-t;
  let onemt2=onemt*onemt;
  return onemt2*onemt*a+t*(3.0*(onemt2*b+t*onemt*c)+t*t*d);
}

// Return one-third of the first derivative of the Bezier curve defined
// by a,b,c,d at t=0.
function bezierP(a,b)
{
  return [b[0]-a[0],
          b[1]-a[1],
          b[2]-a[2]];
}

// Return one-half of the second derivative of the Bezier curve defined
// by a,b,c,d at t=0.
function bezierPP(a,b,c)
{
  return [3*(a[0]+c[0])-6*b[0],
          3*(a[1]+c[1])-6*b[1],
          3*(a[2]+c[2])-6*b[2]];
}

// Return one-sixth of the third derivative of the Bezier curve defined by
// a,b,c,d at t=0.
function bezierPPP(a,b,c,d)
{
  return [d[0]-a[0]+3*(b[0]-c[0]),
          d[1]-a[1]+3*(b[1]-c[1]),
          d[2]-a[2]+3*(b[2]-c[2])];
}

// Return four-thirds of the first derivative of the Bezier curve defined by
// a,b,c,d at t=1/2.
function bezierPh(a,b,c,d)
{
  return [c[0]+d[0]-a[0]-b[0],
          c[1]+d[1]-a[1]-b[1],
          c[2]+d[2]-a[2]-b[2]];
}

// Return two-thirds of the second derivative of the Bezier curve defined by
// a,b,c,d at t=1/2.
function bezierPPh(a,b,c,d)
{
  return [3*a[0]-5*b[0]+c[0]+d[0],
          3*a[1]-5*b[1]+c[1]+d[1],
          3*a[2]-5*b[2]+c[2]+d[2]];
}

/**
 * Return the maximum distance squared of points c0 and c1 from
 * the respective internal control points of z0--z1.
*/
function Straightness(z0,c0,c1,z1)
{
  let v=[third*(z1[0]-z0[0]),third*(z1[1]-z0[1]),third*(z1[2]-z0[2])];
  return Math.max(abs2([c0[0]-v[0]-z0[0],c0[1]-v[1]-z0[1],c0[2]-v[2]-z0[2]]),
    abs2([z1[0]-v[0]-c1[0],z1[1]-v[1]-c1[1],z1[2]-v[2]-c1[2]]));
}

// Return one ninth of the relative flatness squared of a--b and c--d.
function Flatness(a,b,c,d)
{
  let u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
  let v=[d[0]-c[0],d[1]-c[1],d[2]-c[2]];
  return Math.max(abs2(cross(u,unit(v))),abs2(cross(v,unit(u))))/9;
}

// Return the vertices of the box containing 3d points m and M.
function corners(m,M)
{
  return [m,[m[0],m[1],M[2]],[m[0],M[1],m[2]],[m[0],M[1],M[2]],
          [M[0],m[1],m[2]],[M[0],m[1],M[2]],[M[0],M[1],m[2]],M];
}

function minbound(v) {
  return [
    Math.min(v[0][0],v[1][0],v[2][0],v[3][0],v[4][0],v[5][0],v[6][0],v[7][0]),
    Math.min(v[0][1],v[1][1],v[2][1],v[3][1],v[4][1],v[5][1],v[6][1],v[7][1]),
    Math.min(v[0][2],v[1][2],v[2][2],v[3][2],v[4][2],v[5][2],v[6][2],v[7][2])
  ];
}

function maxbound(v) {
  return [
    Math.max(v[0][0],v[1][0],v[2][0],v[3][0],v[4][0],v[5][0],v[6][0],v[7][0]),
    Math.max(v[0][1],v[1][1],v[2][1],v[3][1],v[4][1],v[5][1],v[6][1],v[7][1]),
    Math.max(v[0][2],v[1][2],v[2][2],v[3][2],v[4][2],v[5][2],v[6][2],v[7][2])
  ];
}

/**
 * Perform a change of basis
 * @param {*} out Out Matrix
 * @param {*} mat Matrix
 *
 * Compute the matrix (translMatrix) * mat * (translMatrix)^{-1}
 */

function COBTarget(out,mat)
{
  mat4.fromTranslation(Temp,[center.x,center.y,center.z])
  mat4.invert(cjMatInv,Temp);
  mat4.multiply(out,mat,cjMatInv);
  mat4.multiply(out,Temp,out);
}

function setUniforms(data,shader)
{
  let pixel=shader == pixelShader;

  gl.useProgram(shader);

  gl.enableVertexAttribArray(positionAttribute);

  if(pixel)
    gl.enableVertexAttribArray(widthAttribute);

  let normals=!pixel && Lights.length > 0;
  if(normals)
    gl.enableVertexAttribArray(normalAttribute);

  gl.enableVertexAttribArray(materialAttribute);

  shader.projViewMatUniform=gl.getUniformLocation(shader,"projViewMat");
  shader.viewMatUniform=gl.getUniformLocation(shader,"viewMat");
  shader.normMatUniform=gl.getUniformLocation(shader,"normMat");

  if(shader == colorShader || shader == transparentShader)
    gl.enableVertexAttribArray(colorAttribute);

  if(normals) {
    for(let i=0; i < Lights.length; ++i)
      Lights[i].setUniform(shader,i);
  }

  for(let i=0; i < data.materials.length; ++i)
      data.materials[i].setUniform(shader,i);

  gl.uniformMatrix4fv(shader.projViewMatUniform,false,projViewMat);
  gl.uniformMatrix4fv(shader.viewMatUniform,false,viewMat);
  gl.uniformMatrix3fv(shader.normMatUniform,false,normMat);
}

function handleMouseDown(event)
{
  if(!zoomEnabled)
    enableZoom();
  mouseDownOrTouchActive=true;
  lastMouseX=event.clientX;
  lastMouseY=event.clientY;
}

let pinch=false;
let pinchStart;

function pinchDistance(touches)
{
  return Math.hypot(
    touches[0].pageX-touches[1].pageX,
    touches[0].pageY-touches[1].pageY);
}


let touchStartTime;

function handleTouchStart(event)
{
  event.preventDefault();
  if(!zoomEnabled)
    enableZoom();
  let touches=event.targetTouches;
  swipe=rotate=pinch=false;
  if(zooming) return;

  if(touches.length == 1 && !mouseDownOrTouchActive) {
    touchStartTime=new Date().getTime();
    touchId=touches[0].identifier;
    lastMouseX=touches[0].pageX,
    lastMouseY=touches[0].pageY;
  }

  if(touches.length == 2 && !mouseDownOrTouchActive) {
    touchId=touches[0].identifier;
    pinchStart=pinchDistance(touches);
    pinch=true;
  }
}

function handleMouseUpOrTouchEnd(event)
{
  mouseDownOrTouchActive=false;
}

function rotateScene(lastX,lastY,rawX,rawY,factor)
{
  if(lastX == rawX && lastY == rawY) return;
  let [angle,axis]=arcball([lastX,-lastY],[rawX,-rawY]);

  mat4.fromRotation(Temp,2*factor*ArcballFactor*angle/Zoom,axis);
  mat4.multiply(rotMat,Temp,rotMat);
}

function shiftScene(lastX,lastY,rawX,rawY)
{
  let Zoominv=1/Zoom;
  shift.x += (rawX-lastX)*Zoominv*halfCanvasWidth;
  shift.y -= (rawY-lastY)*Zoominv*halfCanvasHeight;
}

function panScene(lastX,lastY,rawX,rawY)
{
  if(W.orthographic) {
    shiftScene(lastX,lastY,rawX,rawY);
  } else {
    center.x += (rawX-lastX)*(viewParam.xmax-viewParam.xmin);
    center.y -= (rawY-lastY)*(viewParam.ymax-viewParam.ymin);
  }
}

function updateViewMatrix()
{
  COBTarget(viewMat,rotMat);
  mat4.translate(viewMat,viewMat,[center.x,center.y,0]);
  mat3.fromMat4(viewMat3,viewMat);
  mat3.invert(normMat,viewMat3);
  mat4.multiply(projViewMat,projMat,viewMat);
}

function capzoom()
{
  let maxzoom=Math.sqrt(Number.MAX_VALUE);
  let minzoom=1/maxzoom;
  if(Zoom <= minzoom) Zoom=minzoom;
  if(Zoom >= maxzoom) Zoom=maxzoom;

  if(zoomRemeshFactor*Zoom < lastZoom || Zoom > zoomRemeshFactor*lastZoom) {
    remesh=true;
    lastZoom=Zoom;
  }
}

function zoomImage(diff)
{
  let stepPower=W.zoomStep*halfCanvasHeight*diff;
  const limit=Math.log(0.1*Number.MAX_VALUE)/Math.log(W.zoomFactor);

  if(Math.abs(stepPower) < limit) {
    Zoom *= W.zoomFactor**stepPower;
    capzoom();
  }
}

function normMouse(v)
{
  let v0=v[0];
  let v1=v[1];
  let norm=Math.hypot(v0,v1);
  if(norm > 1) {
    denom=1/norm;
    v0 *= denom;
    v1 *= denom;
  }
  return [v0,v1,Math.sqrt(Math.max(1-v1*v1-v0*v0,0))];
}

function arcball(oldmouse,newmouse)
{
  let oldMouse=normMouse(oldmouse);
  let newMouse=normMouse(newmouse);
  let Dot=dot(oldMouse,newMouse);
  let angle=Dot > 1 ? 0 : Dot < -1 ? pi : Math.acos(Dot);
  return [angle,unit(cross(oldMouse,newMouse))]
}

/**
 * Mouse Drag Zoom
 * @param {*} lastX unused
 * @param {*} lastY
 * @param {*} rawX unused
 * @param {*} rawY
 */
function zoomScene(lastX,lastY,rawX,rawY)
{
  zoomImage(lastY-rawY);
}

// mode:
const DRAGMODE_ROTATE=1;
const DRAGMODE_SHIFT=2;
const DRAGMODE_ZOOM=3;
const DRAGMODE_PAN=4
function processDrag(newX,newY,mode,factor=1)
{
  let dragFunc;
  switch (mode) {
    case DRAGMODE_ROTATE:
      dragFunc=rotateScene;
      break;
    case DRAGMODE_SHIFT:
      dragFunc=shiftScene;
      break;
    case DRAGMODE_ZOOM:
      dragFunc=zoomScene;
      break;
    case DRAGMODE_PAN:
      dragFunc=panScene;
      break;
    default:
      dragFunc=(_a,_b,_c,_d) => {};
      break;
  }

  let lastX=(lastMouseX-halfCanvasWidth)/halfCanvasWidth;
  let lastY=(lastMouseY-halfCanvasHeight)/halfCanvasHeight;
  let rawX=(newX-halfCanvasWidth)/halfCanvasWidth;
  let rawY=(newY-halfCanvasHeight)/halfCanvasHeight;

  dragFunc(lastX,lastY,rawX,rawY,factor);

  lastMouseX=newX;
  lastMouseY=newY;

  setProjection();
  drawScene();
}

let zoomEnabled=0;

function enableZoom()
{
  zoomEnabled=1;
  W.canvas.addEventListener("wheel",handleMouseWheel,false);
}

function disableZoom()
{
  zoomEnabled=0;
  W.canvas.removeEventListener("wheel",handleMouseWheel,false);
}

function Camera()
{
  let vCamera=Array(3);
  let vUp=Array(3);
  let vTarget=Array(3);

  let cx=center.x;
  let cy=center.y;
  let cz=0.5*(viewParam.zmin+viewParam.zmax);

  for(let i=0; i < 3; ++i) {
    let sumCamera=0.0, sumTarget=0.0, sumUp=0.0;
    let i4=4*i;
    for(let j=0; j < 4; ++j) {
      let j4=4*j;
      let R0=rotMat[j4];
      let R1=rotMat[j4+1];
      let R2=rotMat[j4+2];
      let R3=rotMat[j4+3];
      let T4ij=W.Transform[i4+j];
      sumCamera += T4ij*(R3-cx*R0-cy*R1-cz*R2);
      sumUp += T4ij*R1;
      sumTarget += T4ij*(R3-cx*R0-cy*R1);
    }
    vCamera[i]=sumCamera;
    vUp[i]=sumUp;
    vTarget[i]=sumTarget;
  }
  return [vCamera,vUp,vTarget];
}

function projection()
{
  let camera,up,target;
  [camera,up,target]=Camera();

  let projection=W.orthographic ? "  orthographic(" : "  perspective(";
  let indent="".padStart(projection.length);

  let currentprojection="currentprojection="+"\n"+
      projection+"camera=("+camera+"),\n"+
      indent+"up=("+up+"),"+"\n"+
      indent+"target=("+target+"),"+"\n"+
      indent+"zoom="+Zoom*W.initialZoom/W.zoom0;

  if(!W.orthographic)
    currentprojection += ","+"\n"
    +indent+"angle="+
    2.0*Math.atan(Math.tan(0.5*W.angleOfView)/Zoom)/radians;

  if(xshift != 0 || yshift != 0)
    currentprojection += ","+"\n"+
    indent+"viewportshift=("+xshift+","+yshift+")";

  if(!W.orthographic)
    currentprojection += ","+"\n"+
    indent+"autoadjust=false";

  currentprojection += ");"+"\n";

  window.parent.asyProjection=true;
  return currentprojection;
}

// 在全局区域声明
let totalRotationAngle = 0;

function handleKey(event)
{
  let ESC=27;

  if(!zoomEnabled)
    enableZoom();

  if(W.embedded && zoomEnabled && event.keyCode == ESC) {
    disableZoom();
    return;
  }

  let keycode=event.key;
  let axis=[];
  let translation = [0, 0, 0];  // Translation vector
  let translMatrix = mat4.create();  // Create an empty 4x4 matrix
  
  // define at top of your keydown handler or even globally
    const Ta = mat4.fromValues(
      0.939692620785908,  0,                   0.342020143325669, 0,
      0,                  1,                   0,                 0,
      -0.342020143325669, 0,                   0.939692620785908, 0,
      -0.684040286651337, 3,                   0.879385241571817, 1
    );
    const invTa = mat4.create();
    mat4.invert(invTa, Ta);

  switch(keycode) {
  case 'x':
    axis=[1,0,0];
    break;
  case 'y':
    axis=[0,1,0];
    break;
  case 'z':
    axis=[0,0,1];
    break;
  case 'h':
    home();
    break;
  case 'm':
    ++wireframe;
    if(wireframe == 3) wireframe=0;
    if(wireframe != 2) {
      if(!W.embedded)
        deleteShaders();
      initShaders(W.ibl);
    }
    remesh=true;
    drawScene();
    break;
  case '+':
  case '=':
  case '>':
    expand();
    break;
  case '-':
  case '_':
  case '<':
    shrink();
    break;
  case 'c':
    showCamera();
    break;

 // added by asmwarrior key arrow up/down
  case 'ArrowUp':
    // Define a translation vector (moving along the Z-axis)
    //translationVector = [0, 0, 1];
    //mat4.fromTranslation(translMatrix, translationVector); // Create a translation matrix from the translation vector

    totalRotationAngle += 10 * Math.PI / 180; // 增加10度

    mat4.fromZRotation(translMatrix, totalRotationAngle); // 使用累计角度
    // mat4.fromZRotation(translMatrix, 3.14);                    // Rotate around an axis


    mat4.copy(gMotionMatrix, gInvTu2w); // we need a deep copy, so no assignment operator
    mat4.multiply(gMotionMatrix, gMotionMatrix, Ta);
    mat4.multiply(gMotionMatrix, gMotionMatrix, translMatrix);  // temp = gInvTu2w * translMatrix
    mat4.multiply(gMotionMatrix, gMotionMatrix, invTa);
    mat4.multiply(gMotionMatrix, gMotionMatrix, gTu2w);     // Final = temp * gTu2w

    //mat4.multiply(gMotionMatrix, gMotionMatrix, translMatrix);
    //mat4.multiply(gMotionMatrix, gMotionMatrix, gTu2w);

    console.log("Up key arrow pressed, gMotionMatrix = ", gMotionMatrix);
    remesh=true;
    drawScene();
    break;
    case 'ArrowDown':
      totalRotationAngle -= 10 * Math.PI / 180; // decrease by 10 degrees

      mat4.fromZRotation(translMatrix, totalRotationAngle); // use updated angle

      mat4.copy(gMotionMatrix, gInvTu2w);
      mat4.multiply(gMotionMatrix, gMotionMatrix, Ta);
      mat4.multiply(gMotionMatrix, gMotionMatrix, translMatrix);
      mat4.multiply(gMotionMatrix, gMotionMatrix, invTa);
      mat4.multiply(gMotionMatrix, gMotionMatrix, gTu2w);

      console.log("Down key arrow pressed, gMotionMatrix = ", gMotionMatrix);
      remesh = true;
      drawScene();
      break;

  case 'ArrowLeft':
      axisPoint = [0, 0, 0]
      // axisPoint = [-0.684040286651337, 3, 0.879385241571817]
      // axisDirection = [-0.342020143325669, 0, 0.939692620785908]
      axisDirection = [0, 0, 1]
      alpha = 0.5
      gMotionMatrix = rotateAroundAxis(axisPoint, axisDirection, alpha)
      console.log("up key arrow down, gMotionMatrix = ", gMotionMatrix);
      remesh=true;
      drawScene();
      break;
  case 'ArrowRight':
      axisPoint = [-0.684040286651337, 3, 0.879385241571817]
      axisDirection = [-0.342020143325669, 0, 0.939692620785908]
      alpha = -0.5
      gMotionMatrix = rotateAroundAxis(axisPoint, axisDirection, alpha)
      console.log("up key arrow down, gMotionMatrix = ", gMotionMatrix);
      remesh=true;
      drawScene();
      break;
      break;
  default:
    break;
  }

  if(axis.length > 0) {
    mat4.rotate(rotMat,rotMat,0.1,axis);
    updateViewMatrix();
    drawScene();
  }
}

function setZoom()
{
  capzoom();
  setProjection();
  drawScene();
}

function handleMouseWheel(event)
{
  event.preventDefault();

  if(event.deltaY < 0) {
    Zoom *= W.zoomFactor;
  } else {
    Zoom /= W.zoomFactor;
  }

  setZoom();
}

function handleMouseMove(event)
{
  if(!mouseDownOrTouchActive) {
    return;
  }

  let newX=event.clientX;
  let newY=event.clientY;

  let mode;
  if(event.getModifierState("Control")) {
    mode=DRAGMODE_SHIFT;
  } else if(event.getModifierState("Shift")) {
    mode=DRAGMODE_ZOOM;
  } else if(event.getModifierState("Alt")) {
    mode=DRAGMODE_PAN;
  } else {
    mode=DRAGMODE_ROTATE;
  }

  processDrag(newX,newY,mode);
}

let zooming=false;
let swipe=false;
let rotate=false;

function handleTouchMove(event)
{
  event.preventDefault();
  if(zooming) return;
  let touches=event.targetTouches;

  if(!pinch && touches.length == 1 && touchId == touches[0].identifier) {
    let newX=touches[0].pageX;
    let newY=touches[0].pageY;
    let dx=newX-lastMouseX;
    let dy=newY-lastMouseY;
    let stationary=dx*dx+dy*dy <= W.shiftHoldDistance*W.shiftHoldDistance;
    if(stationary) {
      if(!swipe && !rotate &&
         new Date().getTime()-touchStartTime > W.shiftWaitTime) {
        if(navigator.vibrate)
          window.navigator.vibrate(W.vibrateTime);
        swipe=true;
      }
    }
    if(swipe)
      processDrag(newX,newY,DRAGMODE_SHIFT);
    else if(!stationary) {
      rotate=true;
      let newX=touches[0].pageX;
      let newY=touches[0].pageY;
      processDrag(newX,newY,DRAGMODE_ROTATE,0.5);
    }
  }

  if(pinch && !swipe &&
     touches.length == 2 && touchId == touches[0].identifier) {
    let distance=pinchDistance(touches);
    let diff=distance-pinchStart;
    zooming=true;
    diff *= W.zoomPinchFactor;
    if(diff > W.zoomPinchCap) diff=W.zoomPinchCap;
    if(diff < -W.zoomPinchCap) diff=-W.zoomPinchCap;
    zoomImage(diff/size2);
    pinchStart=distance;
    swipe=rotate=zooming=false;
    setProjection();
    drawScene();
  }
}

let zbuffer=[];

function transformVertices(vertices)
{
  let Tz0=viewMat[2];
  let Tz1=viewMat[6];
  let Tz2=viewMat[10];
  zbuffer.length=vertices.length;
  for(let i=0; i < vertices.length; ++i) {
    let i6=6*i;
    zbuffer[i]=Tz0*vertices[i6]+Tz1*vertices[i6+1]+Tz2*vertices[i6+2];
  }
}

function drawMaterial0()
{
  drawBuffer(material0Data,pixelShader);
  material0Data.clear();
}

function drawMaterial1()
{
  drawBuffer(material1Data,materialShader);
  material1Data.clear();
}

function drawMaterial()
{
  drawBuffer(materialData,materialShader);
  materialData.clear();
}

function drawColor()
{
  drawBuffer(colorData,colorShader);
  colorData.clear();
}

function drawTriangle()
{
  drawBuffer(triangleData,transparentShader);
  triangleData.rendered=false; // Force copying of sorted triangles to GPU.
  triangleData.clear();
}

function drawTransparent()
{
  let indices=transparentData.indices;
  if(wireframe > 0) {
    drawBuffer(transparentData,transparentShader,indices);
    transparentData.clear();
    return;
  }
  if(indices.length > 0) {
    transformVertices(transparentData.vertices);

    let n=indices.length/3;
    let triangles=Array(n).fill().map((_,i)=>i);

    triangles.sort(function(a,b) {
      let a3=3*a;
      Ia=indices[a3];
      Ib=indices[a3+1];
      Ic=indices[a3+2];

      let b3=3*b;
      IA=indices[b3];
      IB=indices[b3+1];
      IC=indices[b3+2];

      return zbuffer[Ia]+zbuffer[Ib]+zbuffer[Ic] <
        zbuffer[IA]+zbuffer[IB]+zbuffer[IC] ? -1 : 1;
    });

    let Indices=Array(indices.length);

    for(let i=0; i < n; ++i) {
      let i3=3*i;
      let t=3*triangles[i];
      Indices[3*i]=indices[t];
      Indices[3*i+1]=indices[t+1];
      Indices[3*i+2]=indices[t+2];
    }

    gl.depthMask(false); // Enable transparency
    drawBuffer(transparentData,transparentShader,Indices);
 // Force copying of sorted triangles to GPU.
    transparentData.rendered=false;
    gl.depthMask(true); // Disable transparency
  }
  transparentData.clear();
}

function drawBuffers()
{
  drawMaterial0();
  drawMaterial1();
  drawMaterial();
  drawColor();
  drawTriangle();
  drawTransparent();
  requestAnimationFrame(drawBuffers);
}

function drawScene()
{
  if(W.embedded) {
    offscreen.width=W.canvasWidth;
    offscreen.height=W.canvasHeight;
    setViewport();
  }

  gl.clearColor(W.background[0],W.background[1],W.background[2],W.background[3]);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  console.log("loop on all geometry P list");

  // added by asmwarrior to set the point position
  for (let i = 0; i < P.length; i++) {
    if (P[i].objectName == "link2")
        P[i].setLocalTransform(gMotionMatrix);
    P[i].render();
  }

  console.log("drawBuffers()");
  drawBuffers();

  if(W.embedded) {
    context.clearRect(0,0,W.canvasWidth,W.canvasHeight);
    context.drawImage(offscreen,0,0);
  }

  if(wireframe == 0) remesh=false;
}

function setDimensions(width,height,X,Y)
{
  let Aspect=width/height;
  xshift=(X/width+W.viewportShift[0])*Zoom;
  yshift=(Y/height+W.viewportShift[1])*Zoom;
  let Zoominv=1/Zoom;
  if(W.orthographic) {
    let xsize=W.maxBound[0]-W.minBound[0];
    let ysize=W.maxBound[1]-W.minBound[1];
    if(xsize < ysize*Aspect) {
      let r=0.5*ysize*Aspect*Zoominv;
      let X0=2*r*xshift;
      let Y0=ysize*Zoominv*yshift;
      viewParam.xmin=-r-X0;
      viewParam.xmax=r-X0;
      viewParam.ymin=W.minBound[1]*Zoominv-Y0;
      viewParam.ymax=W.maxBound[1]*Zoominv-Y0;
    } else {
      let r=0.5*xsize*Zoominv/Aspect;
      let X0=xsize*Zoominv*xshift;
      let Y0=2*r*yshift;
      viewParam.xmin=W.minBound[0]*Zoominv-X0;
      viewParam.xmax=W.maxBound[0]*Zoominv-X0;
      viewParam.ymin=-r-Y0;
      viewParam.ymax=r-Y0;
    }
  } else {
    let r=H*Zoominv;
    let rAspect=r*Aspect;
    let X0=2*rAspect*xshift;
    let Y0=2*r*yshift;
    viewParam.xmin=-rAspect-X0;
    viewParam.xmax=rAspect-X0;
    viewParam.ymin=-r-Y0;
    viewParam.ymax=r-Y0;
  }
}

function setProjection()
{
  setDimensions(W.canvasWidth,W.canvasHeight,shift.x,shift.y);
  let f=W.orthographic ? mat4.ortho : mat4.frustum;
  f(projMat,viewParam.xmin,viewParam.xmax,
    viewParam.ymin,viewParam.ymax,
    -viewParam.zmax,-viewParam.zmin);
  updateViewMatrix();

  if(window.top.asyWebApplication)
    window.top.asyWebApplication.setProjection(projection());
}

function showCamera()
{
  if(!window.top.asyWebApplication)
    prompt("Ctrl+c Enter to copy currentprojection to clipboard; then append to asy file:",
           projection());
}

function initProjection()
{
  H=-Math.tan(0.5*W.angleOfView)*W.maxBound[2];

  center.x=center.y=0;
  center.z=0.5*(W.minBound[2]+W.maxBound[2]);
  lastZoom=Zoom=W.zoom0;

  viewParam.zmin=W.minBound[2];
  viewParam.zmax=W.maxBound[2];

  shift.x=shift.y=0;
}

function setViewport()
{
  gl.viewportWidth=W.canvasWidth;
  gl.viewportHeight=W.canvasHeight;
  gl.viewport(0.5*(W.canvas.width-W.canvasWidth),0.5*(W.canvas.height-W.canvasHeight),
              W.canvasWidth,W.canvasHeight);
  gl.scissor(0,0,W.canvas.width,W.canvas.height);
}

function setCanvas()
{
  if(W.embedded) {
    W.canvas.width=offscreen.width=W.canvasWidth;
    W.canvas.height=offscreen.height=W.canvasHeight;
  }
  size2=Math.hypot(W.canvasWidth,W.canvasHeight);
  halfCanvasWidth=0.5*W.canvas.width;
  halfCanvasHeight=0.5*W.canvas.height;
  ArcballFactor=1+8*Math.hypot(W.viewportMargin[0],W.viewportMargin[1])/size2;
}

function setsize(w,h)
{
  if(w > maxViewportWidth)
    w=maxViewportWidth;

  if(h > maxViewportHeight)
    h=maxViewportHeight;

  shift.x *= w/W.canvasWidth;
  shift.y *= h/W.canvasHeight;

  W.canvasWidth=w;
  W.canvasHeight=h;
  setCanvas();
  setViewport();

  setProjection();
  remesh=true;
}

function resize()
{
  W.zoom0=W.initialZoom;

  if(window.top.asyWebApplication &&
     window.top.asyWebApplication.getProjection() == "")
    window.parent.asyProjection=false;

  if(W.absolute && !W.embedded) {
    W.canvasWidth=W.canvasWidth0*window.devicePixelRatio;
    W.canvasHeight=W.canvasHeight0*window.devicePixelRatio;
  } else {
    let Aspect=W.canvasWidth0/W.canvasHeight0;
    W.canvasWidth=Math.max(window.innerWidth-windowTrim,windowTrim);
    W.canvasHeight=Math.max(window.innerHeight-windowTrim,windowTrim);

    if(!W.orthographic && !window.parent.asyProjection &&
       W.canvasWidth < W.canvasHeight*Aspect)
      W.zoom0 *= W.canvasWidth/(W.canvasHeight*Aspect);
  }

  W.canvas.width=W.canvasWidth;
  W.canvas.height=W.canvasHeight;

  let maxViewportWidth=window.innerWidth;
  let maxViewportHeight=window.innerHeight;

  let Zoominv=1/W.zoom0;
  W.viewportShift[0] *= Zoominv;
  W.viewportShift[1] *= Zoominv;

  setsize(W.canvasWidth,W.canvasHeight);
  redrawScene();
}

function expand()
{
  Zoom *= W.zoomFactor;
  setZoom();
}

function shrink()
{
  Zoom /= W.zoomFactor;
  setZoom();
}

let pixelShader,materialShader,colorShader,transparentShader;

class Align {
  constructor(center,dir) {
    this.center=center;
    if(dir) {
      let theta=dir[0];
      let phi=dir[1];

      this.ct=Math.cos(theta);
      this.st=Math.sin(theta);
      this.cp=Math.cos(phi);
      this.sp=Math.sin(phi);
    }
  }

  T0(v) {
    return [v[0]+this.center[0],v[1]+this.center[1],v[2]+this.center[2]];
  }

  T(v) {
    let x=v[0];
    let Y=v[1];
    let z=v[2];
    let X=x*this.ct+z*this.st;
    return [X*this.cp-Y*this.sp+this.center[0],
            X*this.sp+Y*this.cp+this.center[1],
            -x*this.st+z*this.ct+this.center[2]];
  };
}

function Tcorners(T,m,M)
{
  let v=[T(m),T([m[0],m[1],M[2]]),T([m[0],M[1],m[2]]),
         T([m[0],M[1],M[2]]),T([M[0],m[1],m[2]]),
         T([M[0],m[1],M[2]]),T([M[0],M[1],m[2]]),T(M)];
  return [minbound(v),maxbound(v)];
}

function light(direction,color)
{
  Lights.push(new Light(direction,color));
}

function material(diffuse,emissive,specular,shininess,metallic,fresnel0)
{
  Materials.push(new Material(diffuse,emissive,specular,shininess,metallic,
                              fresnel0));
}

function patch(controlpoints,CenterIndex,MaterialIndex,color)
{
  P.push(new BezierPatch(controlpoints,CenterIndex,MaterialIndex,color));
}

function curve(controlpoints,CenterIndex,MaterialIndex)
{
  P.push(new BezierCurve(controlpoints,CenterIndex,MaterialIndex));
}

function pixel(controlpoint,width,MaterialIndex)
{
  P.push(new Pixel(controlpoint,width,MaterialIndex));
}

function triangles(CenterIndex,MaterialIndex)
{
  P.push(new Triangles(CenterIndex,MaterialIndex));
  window.Positions=Positions=[];
  window.Normals=Normals=[];
  window.Colors=Colors=[];
  window.Indices=Indices=[];
}

// draw a sphere of radius r about center
// (or optionally a hemisphere symmetric about direction dir)
function sphere(center,r,CenterIndex,MaterialIndex,dir)
{
  let b=0.524670512339254;
  let c=0.595936986722291;
  let d=0.954967051233925;
  let e=0.0820155480083437;
  let f=0.996685028842544;
  let g=0.0549670512339254;
  let h=0.998880711874577;
  let i=0.0405017186586849;

  let octant=[[
    [1,0,0],
    [1,0,b],
    [c,0,d],
    [e,0,f],

    [1,a,0],
    [1,a,b],
    [c,a*c,d],
    [e,a*e,f],

    [a,1,0],
    [a,1,b],
    [a*c,c,d],
    [a*e,e,f],

    [0,1,0],
    [0,1,b],
    [0,c,d],
    [0,e,f]
  ],[
    [e,0,f],
    [e,a*e,f],
    [g,0,h],
    [a*e,e,f],
    [i,i,1],
    [0.05*a,0,1],
    [0,e,f],
    [0,g,h],
    [0,0.05*a,1],
    [0,0,1]
  ]];

  let rx,ry,rz;
  let A=new Align(center,dir);
  let s,t,z;

  if(dir) {
    s=1;
    z=0;
    t=A.T.bind(A);
  } else {
    s=-1;
    z=-r;
    t=A.T0.bind(A);
  }

  function T(V) {
    let p=Array(V.length);
    for(let i=0; i < V.length; ++i) {
      let v=V[i];
      p[i]=t([rx*v[0],ry*v[1],rz*v[2]]);
    }
    return p;
  }

  let v=Tcorners(t,[-r,-r,z],[r,r,r]);
  let Min=v[0], Max=v[1];
  for(let i=-1; i <= 1; i += 2) {
    rx=i*r;
    for(let j=-1; j <= 1; j += 2) {
      ry=j*r;
      for(let k=s; k <= 1; k += 2) {
        rz=k*r;
        for(let m=0; m < 2; ++m)
          P.push(new BezierPatch(T(octant[m]),CenterIndex,MaterialIndex,null,
                                 Min,Max));
      }
    }
  }
}

let a=4/3*(Math.sqrt(2)-1);

// draw a disk of radius r aligned in direction dir
function disk(center,r,CenterIndex,MaterialIndex,dir)
{
  let b=1-2*a/3;

  let unitdisk=[
    [1,0,0],
    [1,-a,0],
    [a,-1,0],
    [0,-1,0],

    [1,a,0],
    [b,0,0],
    [0,-b,0],
    [-a,-1,0],

    [a,1,0],
    [0,b,0],
    [-b,0,0],
    [-1,-a,0],

    [0,1,0],
    [-a,1,0],
    [-1,a,0],
    [-1,0,0]
  ];

  let A=new Align(center,dir);

  function T(V) {
    let p=Array(V.length);
    for(let i=0; i < V.length; ++i) {
      let v=V[i];
      p[i]=A.T([r*v[0],r*v[1],0]);
    }
    return p;
  }

  let v=Tcorners(A.T.bind(A),[-r,-r,0],[r,r,0]);
  P.push(new BezierPatch(T(unitdisk),CenterIndex,MaterialIndex,null,
                         v[0],v[1]));
}

// draw a cylinder with circular base of radius r about center and height h
// aligned in direction dir
function cylinder(center,r,h,CenterIndex,MaterialIndex,dir,core)
{
  let unitcylinder=[
    [1,0,0],
    [1,0,1/3],
    [1,0,2/3],
    [1,0,1],

    [1,a,0],
    [1,a,1/3],
    [1,a,2/3],
    [1,a,1],

    [a,1,0],
    [a,1,1/3],
    [a,1,2/3],
    [a,1,1],

    [0,1,0],
    [0,1,1/3],
    [0,1,2/3],
    [0,1,1]
  ];

  let rx,ry,rz;
  let A=new Align(center,dir);

  function T(V) {
    let p=Array(V.length);
    for(let i=0; i < V.length; ++i) {
      let v=V[i];
      p[i]=A.T([rx*v[0],ry*v[1],h*v[2]]);
    }
    return p;
  }

  let v=Tcorners(A.T.bind(A),[-r,-r,0],[r,r,h]);
  let Min=v[0], Max=v[1];

  for(let i=-1; i <= 1; i += 2) {
    rx=i*r;
    for(let j=-1; j <= 1; j += 2) {
      ry=j*r;
      P.push(new BezierPatch(T(unitcylinder),CenterIndex,MaterialIndex,null,
                             Min,Max));
    }
  }

  if(core) {
    let Center=A.T([0,0,h]);
    P.push(new BezierCurve([center,Center],CenterIndex,MaterialIndex,
                           center,Center));
  }
}

function rmf(z0,c0,c1,z1,t)
{
  class Rmf {
    constructor(p,r,t) {
      this.p=p;
      this.r=r;
      this.t=t;
      this.s=cross(t,r);
    }
  }

  // Return a unit vector perpendicular to a given unit vector v.
  function perp(v)
  {
    let u=cross(v,[0,1,0]);
    let norm=Number.EPSILON*abs2(v);
    if(abs2(u) > norm) return unit(u);
    u=cross(v,[0,0,1]);
    return (abs2(u) > norm) ? unit(u) : [1,0,0];
  }

  let norm=Number.EPSILON*Math.max(abs2(z0),abs2(c0),abs2(c1),
                                abs2(z1));

// Special case of dir for t in (0,1].
  function dir(t) {
    if(t == 1) {
      let dir=[z1[0]-c1[0],
               z1[1]-c1[1],
               z1[2]-c1[2]];
      if(abs2(dir) > norm) return unit(dir);
      dir=[2*c1[0]-c0[0]-z1[0],
           2*c1[1]-c0[1]-z1[1],
           2*c1[2]-c0[2]-z1[2]];
      if(abs2(dir) > norm) return unit(dir);
      return [z1[0]-z0[0]+3*(c0[0]-c1[0]),
              z1[1]-z0[1]+3*(c0[1]-c1[1]),
              z1[2]-z0[2]+3*(c0[2]-c1[2])];
    }
    let a=[z1[0]-z0[0]+3*(c0[0]-c1[0]),
           z1[1]-z0[1]+3*(c0[1]-c1[1]),
           z1[2]-z0[2]+3*(c0[2]-c1[2])];
    let b=[2*(z0[0]+c1[0])-4*c0[0],
           2*(z0[1]+c1[1])-4*c0[1],
           2*(z0[2]+c1[2])-4*c0[2]];
    let c=[c0[0]-z0[0],c0[1]-z0[1],c0[2]-z0[2]];
    let t2=t*t;
    let dir=[a[0]*t2+b[0]*t+c[0],
             a[1]*t2+b[1]*t+c[1],
             a[2]*t2+b[2]*t+c[2]];
    if(abs2(dir) > norm) return unit(dir);
    t2=2*t;
    dir=[a[0]*t2+b[0],
         a[1]*t2+b[1],
         a[2]*t2+b[2]];
    if(abs2(dir) > norm) return unit(dir);
    return unit(a);
  }

  let R=Array(t.length);
  let T=[c0[0]-z0[0],
         c0[1]-z0[1],
         c0[2]-z0[2]];
  if(abs2(T) < norm) {
    T=[z0[0]-2*c0[0]+c1[0],
       z0[1]-2*c0[1]+c1[1],
       z0[2]-2*c0[2]+c1[2]];
    if(abs2(T) < norm)
      T=[z1[0]-z0[0]+3*(c0[0]-c1[0]),
         z1[1]-z0[1]+3*(c0[1]-c1[1]),
         z1[2]-z0[2]+3*(c0[2]-c1[2])];
  }
  T=unit(T);
  let Tp=perp(T);
  R[0]=new Rmf(z0,Tp,T);
  for(let i=1; i < t.length; ++i) {
    let Ri=R[i-1];
    let s=t[i];
    let onemt=1-s;
    let onemt2=onemt*onemt;
    let onemt3=onemt2*onemt;
    let s3=3*s;
    onemt2 *= s3;
    onemt *= s3*s;
    let t3=s*s*s;
    let p=[
      onemt3*z0[0]+onemt2*c0[0]+onemt*c1[0]+t3*z1[0],
      onemt3*z0[1]+onemt2*c0[1]+onemt*c1[1]+t3*z1[1],
      onemt3*z0[2]+onemt2*c0[2]+onemt*c1[2]+t3*z1[2]];
    let v1=[p[0]-Ri.p[0],p[1]-Ri.p[1],p[2]-Ri.p[2]];
    if(v1[0] != 0 || v1[1] != 0 || v1[2] != 0) {
      let r=Ri.r;
      let u1=unit(v1);
      let ti=Ri.t;
      let dotu1ti=dot(u1,ti)
      let tp=[ti[0]-2*dotu1ti*u1[0],
              ti[1]-2*dotu1ti*u1[1],
              ti[2]-2*dotu1ti*u1[2]];
      ti=dir(s);
      let dotu1r2=2*dot(u1,r);
      let rp=[r[0]-dotu1r2*u1[0],r[1]-dotu1r2*u1[1],r[2]-dotu1r2*u1[2]];
      let u2=unit([ti[0]-tp[0],ti[1]-tp[1],ti[2]-tp[2]]);
      let dotu2rp2=2*dot(u2,rp);
      rp=[rp[0]-dotu2rp2*u2[0],rp[1]-dotu2rp2*u2[1],rp[2]-dotu2rp2*u2[2]];
      R[i]=new Rmf(p,unit(rp),unit(ti));
    } else
      R[i]=R[i-1];
  }
  return R;
}

// draw a tube of width w using control points v
function tube(v,w,CenterIndex,MaterialIndex,core)
{
  let Rmf=rmf(v[0],v[1],v[2],v[3],[0,1/3,2/3,1]);

  let aw=a*w;
  let arc=[[w,0],[w,aw],[aw,w],[0,w]];

  function f(a,b,c,d) {
    let s=Array(16);
    for(let i=0; i < 4; ++i) {
      let R=Rmf[i];

      let R0=R.r[0], R1=R.s[0];
      let T0=R0*a+R1*b;
      let T1=R0*c+R1*d;

      R0=R.r[1]; R1=R.s[1];
      let T4=R0*a+R1*b;
      let T5=R0*c+R1*d;

      R0=R.r[2]; R1=R.s[2];
      let T8=R0*a+R1*b;
      let T9=R0*c+R1*d;

      let w=v[i];
      let w0=w[0]; w1=w[1]; w2=w[2];
      for(let j=0; j < 4; ++j) {
        let u=arc[j];
        let x=u[0], y=u[1];
        s[4*i+j]=[T0*x+T1*y+w0,
                  T4*x+T5*y+w1,
                  T8*x+T9*y+w2];
      }
    }
    P.push(new BezierPatch(s,CenterIndex,MaterialIndex));
  }

  f(1,0,0,1);
  f(0,-1,1,0);
  f(-1,0,0,-1);
  f(0,1,-1,0);

  if(core)
    P.push(new BezierCurve(v,CenterIndex,MaterialIndex));
}

async function getReq(req)
{
  return (await fetch(req)).arrayBuffer();
}

function rgb(image) {
  return image.getBytes().filter((element,index) => {return index%4 != 3;});
}

function createTexture(image, textureNumber, fmt=gl.RGB16F)
{
  let width=image.width()
  let height=image.height()
  let tex=gl.createTexture();
  gl.activeTexture(gl.TEXTURE0+textureNumber);
  gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D,0,fmt,width,height,
                0,gl.RGB,gl.FLOAT,rgb(image));
  return tex;
}

async function initIBL()
{
  let imagePath=W.imageURL+W.image+'/';

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  while(true) { // Wait for EXRLoader to become available.
    if(Module.EXRLoader)
      break;
    await sleep(0);
  }

  promises=[
    getReq(W.imageURL+'refl.exr').then(obj => {
      let img=new Module.EXRLoader(obj);
      IBLbdrfMap=createTexture(img,0);
    }),
    getReq(imagePath+'diffuse.exr').then(obj => {
      let img=new Module.EXRLoader(obj);
      IBLDiffuseMap=createTexture(img,1);
    })
  ]

  refl_promise=[]

  refl_promise.push(
    getReq(imagePath+'refl0.exr')
  );
  for(let i=1; i <= roughnessStepCount; ++i) {
    refl_promise.push(
      getReq(imagePath+'refl'+i+'w.exr'))
  }

  finished_promise=Promise.all(refl_promise).then(reflMaps => {
    let tex=gl.createTexture();
    gl.activeTexture(gl.TEXTURE0+2);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAX_LEVEL,reflMaps.length-1)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameterf(gl.TEXTURE_2D,gl.TEXTURE_MIN_LOD,0.0);
    gl.texParameterf(gl.TEXTURE_2D,gl.TEXTURE_MAX_LOD,roughnessStepCount);
    for(let j=0; j < reflMaps.length; ++j) {
      let img=new Module.EXRLoader(reflMaps[j]);
      gl.texImage2D(gl.TEXTURE_2D,j,gl.RGB16F,img.width(),img.height(),
                    0,gl.RGB,gl.FLOAT,rgb(img));
    }
    IBLReflMap=tex;
  });

  promises.push(finished_promise);
  await Promise.all(promises);
}

function webGLStart()
{
  W.canvas=document.getElementById("Asymptote");
  W.embedded=window.top.document != document;

  initGL();

  // added by asmwarrior
  // W.Transform is a row major value array, but the gl-matrix need column major value array
  gTu2w = mat4.fromValues(
    W.Transform[0],  W.Transform[4],  W.Transform[8],  W.Transform[12],
    W.Transform[1],  W.Transform[5],  W.Transform[9],  W.Transform[13],
    W.Transform[2],  W.Transform[6],  W.Transform[10], W.Transform[14],
    W.Transform[3],  W.Transform[7],  W.Transform[11], W.Transform[15]);

  // Assuming 'gTu2w' is your column-major matrix:
  let translation = [gTu2w[12], gTu2w[13], gTu2w[14]];
  console.log('Translation:', translation);

  // // For column 0 (if using column-major for rotation):
  // let scaleX = vec3.length([gTu2w[0], gTu2w[1], gTu2w[2]]);
  // let scaleY = vec3.length([gTu2w[4], gTu2w[5], gTu2w[6]]);
  // let scaleZ = vec3.length([gTu2w[8], gTu2w[9], gTu2w[10]]);
  // console.log('Scale:', scaleX, scaleY, scaleZ);

  let scaleX = Math.sqrt(gTu2w[0] * gTu2w[0] + gTu2w[1] * gTu2w[1] + gTu2w[2] * gTu2w[2]);
  let scaleY = Math.sqrt(gTu2w[4] * gTu2w[4] + gTu2w[5] * gTu2w[5] + gTu2w[6] * gTu2w[6]);
  let scaleZ = Math.sqrt(gTu2w[8] * gTu2w[8] + gTu2w[9] * gTu2w[9] + gTu2w[10] * gTu2w[10]);
  console.log('Scale:', scaleX, scaleY, scaleZ);

  let rotationMatrix = mat3.create();
  // Copy the upper-left 3x3 from gTu2w
  mat3.fromMat4(rotationMatrix, gTu2w);
  // Remove the scaling:
  mat3.scale(rotationMatrix, rotationMatrix, [1/scaleX, 1/scaleY, 1/scaleZ]);
  console.log('Rotation matrix:', rotationMatrix);




  mat4.invert(gInvTu2w, gTu2w); // Invert W.Transform, which is from user coordinates to world coordinates

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.SCISSOR_TEST);

  W.canvas.onmousedown=handleMouseDown;
  document.onmouseup=handleMouseUpOrTouchEnd;
  document.onmousemove=handleMouseMove;
  W.canvas.onkeydown=handleKey;

  if(!W.embedded)
    enableZoom();
  W.canvas.addEventListener("touchstart",handleTouchStart,false);
  W.canvas.addEventListener("touchend",handleMouseUpOrTouchEnd,false);
  W.canvas.addEventListener("touchcancel",handleMouseUpOrTouchEnd,false);
  W.canvas.addEventListener("touchleave",handleMouseUpOrTouchEnd,false);
  W.canvas.addEventListener("touchmove",handleTouchMove,false);
  document.addEventListener("keydown",handleKey,false);

  W.canvasWidth0=W.canvasWidth;
  W.canvasHeight0=W.canvasHeight;

  mat4.identity(rotMat);

  if(window.innerWidth != 0 && window.innerHeight != 0)
    resize();

  window.addEventListener("resize",resize,false);

  if(W.ibl)
    initIBL().then(SetIBL).then(redrawScene);

  home();
}

  window.webGLStart=webGLStart;
  window.light=light;
  window.material=material;
  window.patch=patch;
  window.curve=curve;
  window.pixel=pixel;
  window.triangles=triangles;
  window.sphere=sphere;
  window.disk=disk;
  window.cylinder=cylinder;
  window.tube=tube;
  window.Positions=Positions;
  window.Normals=Normals;
  window.Colors=Colors;
  window.Indices=Indices;

})();
