# ![](assets/ioc-logo.png) The Lesser Magistrate
A collection of Electrical and Mechanical Schematics for the IOC Lesser Magistrate Quizzing System

Schematics, PCB Files, BOM and 3D printing files are [available here](https://github.com/jonathanvanschenck/lesser-magistrate).

To find more information or get involved with Christian Bible Quizzing (CBQ), [click here](https://cbqz.org).

## Philosophy of Design
Heretofore, bible quizzing has had a fairly high barrier to entry; whether it be complicated rulebooks, distinct cultural practices or (of relevance here) expensive supplies. This project
seeks to address that third barrier by providing a low-cost, high-performance quizzing buzzer system, which can built by a reasonably competent individual. Unlike existing systems, we need
to meet the following design requirements:

  - Low cost and easily available parts
  - Easily manufactureable without special tooling
  - Is modular in design (e.g. individual components are easily and cheaply replaceable)
  - Can support up to 15 simultaneous participants

## Build Instructions
A full list of materials (BOM) is [available here](lib/BOM.csv).
Additional build tools are given at the bottom as:
  - Soldering Iron
  - Lead-free Solder
  - 2m Allen Wrench
  - Wire Strippers
  - Super Glue/Epoxy
  - Optional: electrical tape (or equivalent insulation, like heat shrink tubing) -- see erratum 1 below

All electrical schematics are available in the `graphics` folder.

All the electrical schematic/pcb/component files are available in the `lib` folder. Interested parties should aquire a copy of [diptrace](https://diptrace.com/) to view/edit.
The following are two saved shopping carts from digikey for the electrical components necessary for construction, provided here as reference:
  - [LM Set including 16 triggers](https://www.digikey.com/en/mylists/list/9FWNPUPV9Y)
  - [LM Set including 12 triggers](https://www.digikey.com/en/mylists/list/25X0QC0BVT)

All 3D printable parts are available in the `3d` folder; check out [the README](3d/README.md) for details.

For help soldering and constructing the Lesser Magistrate system, a guided build playlist is [available here](https://www.youtube.com/watch?v=u-B20jy8v2o&list=PL-Vn05Kf5ezxIfupx7_Z1d6l5HKGBeLW2).

If you are interested in purchasing a Lesser Magistrate system (or any of the necessary components -- particularly the PCBs), contact [the author](https://github.com/jonathanvanschenck).

### Build Errata
  1. During the final stage of constructing the hand triggers/buzzers, some assemblers have found that the twisting action of inserting the bottom 3d printed plug in for gluing can cause the bent-apart RJ11 contacts to be twisted together. This shorts out the linear switch -- making the buzzer effectively "always on". This can be mitigated by wrapping the exposed metal of the contact/solder/wire with electrical tape or heat shrink tubing.



## Contributing
The Lesser Magistrate is a fully open sourced project, and as such contribution is encouraged! As such PRs are more than welcome, and we would love to hear about [any issues](https://github.com/jonathanvanschenck/lesser-magistrate/issues) you may run into. Feature requests are also encouraged -- though keep in mind features will only be included in this project if they conform to the Philosophy of Design described above. Finally, if you take this project and do something cool with it (like adding extra features not suitable to this design philosophy), we would love to hear about it so that we can add a link to your work in the section below!

## Related Projects

## Deuteronomy 6:5-7
Love the Lord your God with all your heart and with all your soul and with all your strength.
These commandments that I give you today are to be on your hearts.
Impress them on your children. Talk about them when you sit at home and when you walk along the road, when you lie down and when you get up.

