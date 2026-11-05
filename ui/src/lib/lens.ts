/*
 * The lens liquid glass bends the page with: a filter for backdrop-filter that
 * takes a height map of the glass's shape (white on black, as a data url in
 * its feImage), blurs it into a bevel, works out its slope with two Sobel
 * kernels into a displacement map, and bends what is behind the glass at the
 * rim - in three passes a little apart, one per colour, so the colours split
 * where the bend is steepest - then lights it from the top left, which draws
 * the bright rim. The map is a data url because chromium's feImage will not
 * render an element of the page. layout/GlassBar uses it; a phone does not -
 * in Android's WebView this filter, as a backdrop, took 30 ms of GPU a frame.
 */
export function lens_filter(id: string) {
    return `<filter id="${id}" x="0" y="0" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feImage x="0" y="0" preserveAspectRatio="none" result="mask" />
        <feGaussianBlur in="mask" stdDeviation="5" result="soft" />
        <feConvolveMatrix in="soft" order="3" kernelMatrix="-1 0 1 -2 0 2 -1 0 1" divisor="0.6" bias="0.5" preserveAlpha="true" result="gx" />
        <feConvolveMatrix in="soft" order="3" kernelMatrix="-1 -2 -1 0 0 0 1 2 1" divisor="0.6" bias="0.5" preserveAlpha="true" result="gy" />
        <feColorMatrix in="gx" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1" result="rx" />
        <feColorMatrix in="gy" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 0 1" result="ry" />
        <feComposite in="rx" in2="ry" operator="arithmetic" k2="1" k3="1" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="30" xChannelSelector="R" yChannelSelector="G" result="d1" />
        <feColorMatrix in="d1" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cr" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="36" xChannelSelector="R" yChannelSelector="G" result="d2" />
        <feColorMatrix in="d2" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cg" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="42" xChannelSelector="R" yChannelSelector="G" result="d3" />
        <feColorMatrix in="d3" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cb" />
        <feBlend in="cr" in2="cg" mode="screen" result="rg" />
        <feBlend in="rg" in2="cb" mode="screen" result="bent" />
        <feColorMatrix in="soft" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="height" />
        <feSpecularLighting in="height" surfaceScale="5" specularConstant="1.1" specularExponent="28" lighting-color="#fff" result="spec">
            <feDistantLight azimuth="235" elevation="38" />
        </feSpecularLighting>
        <feComposite in="spec" in2="bent" operator="arithmetic" k2="0.55" k3="1" />
    </filter>`
}

