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
A Lesser Magistrate set can be built with a varying number of triggers depending on your needs. Throughout this documentation, examples are given for three common configurations:

- **16 triggers** — the maximum supported: 3 teams of 5 quizzers each, plus 1 trigger reserved for the quiz magistrate.
- **10 triggers** — the typical arrangement for a CBQ quiz: 3 teams of 3 quizzers each, plus 1 for the quiz magistrate.
- **12 triggers** — a 10-trigger set with 2 spares, useful to have on hand in case of hardware failure during a tournament.

If you have recieved a build kit, you should already have all the raw materials to build a lesser magistrate, including electrical components, 3d printed enclosures and hardware. In this case, you will only need a few tools to help during the build:
  - A Soldering Iron (literally anything will work here -- you don't need to spend tons of money on this unless you plan to make a lot of units)
  - Lead-free Solder (Again, literally anything will work here -- the amount of soldering on the project is pretty small so you won't run out)
  - Allen Wrench
  - Phillips head screw driver (long shaft)

There is a video guide you can follow for step-by-step instructions on how to build your Lesser Magistrate system: [available here](https://www.youtube.com/watch?v=u-B20jy8v2o&list=PL-Vn05Kf5ezxIfupx7_Z1d6l5HKGBeLW2).

All electrical schematics are available in the [graphics](./graphcis) directory, which can be helpful during assembly, particularly for those who are more electrically inclined.

There are some additional tools which are very helpful during the build process; but are not strictly necessary:
  - Some elmers glue, or similar light adhesive
  - The assembly jigs, [see the 3d printer directory for details](./3d)

If you are interested in purchasing a Lesser Magistrate system (or any of the necessary components -- particularly the PCBs), contact [the author](https://github.com/jonathanvanschenck).

If you did *not* receive a kit, the next section will explain how to acquire all the necessary raw components.

### Ordering the Components Yourself
If you did not receive kit, you will need to acquire the raw materials. Broadly there are 3 categories of things you will need to purchase:

#### 1. Electrical Component
You will need to buy all the electrical components (meaning chips, resistors, connectors and wires). See the [components README](./components/README.md) for full part lists and Digikey shopping links for 16, 12, and 10 trigger set configurations.

#### 2. PCB
You will also need to buy the actual PCBs to soulder everything to. You can find the gerber files (the extension is `.zip`) in the `gerber` directory, with a [README](./gerber/README.md) for details. You can use any PCB manufacturer you prefer, for example [PCBWay](https://www.pcbway.com/) -- in every case you cant just upload your gerber files and the website will walk you through the steps. Two things to note: (1) make sure to select HASL lead-free surface treatment to avoid lead exposure, use defaults for everything else (2) you will likely be required to order at least 5 of every board; but the boards are sufficiently cheap that shipping is frequently the majority of the PCB cost even when over-buying boards.

#### 3. Plastic Enclosures
You will also need to get plastic enclosures for all the electrical elements. All of this is done with a 3d printer. Many schools and libraries have 3d printers available to the students/members, so try asking around in your community to see if someone has access to a printer to help with this piece. There are also plenty of online services that you can upload a file to and have them print and ship it to you. Though, if you plan on making more than, like, 2 of these units -- just get a printer yourself. They are pretty cheap these days, can you can do a lot with them. Both [Bambu Labs](https://bambulab.com/en-us) and [Prusa Reaserch](https://www.prusa3d.com/) have mid-level and high-end hobbyist models in the $500-$1500 range.

However you plan on getting your prints, you will need the STL files in the [stl](./stl) directory -- see the README there for details.

## Contributing and Development
The Lesser Magistrate is a fully open sourced project, and as such contribution is encouraged! As such PRs are more than welcome, and we would love to hear about [any issues](https://github.com/jonathanvanschenck/lesser-magistrate/issues) you may run into. Feature requests are also encouraged -- though keep in mind features will only be included in this project if they conform to the Philosophy of Design described above. Finally, if you take this project and do something cool with it (like adding extra features not suitable to this design philosophy), we would love to hear about it so that we can add a link to your work in the section below!

Currently the electrical side of the project is developed in [diptrace](https://diptrace.com/), and all the project files are in the [lib](./lib) directory. That being said, we are in the process of converting to KiCAD as the development tool, and also creating a SMD-variant of the LM/LMM/Trigger boards which will facilitate a pick-n-place machine assembly; so don't get too attached to diptrace.

## Related Projects

## Deuteronomy 6:5-7
Love the Lord your God with all your heart and with all your soul and with all your strength.
These commandments that I give you today are to be on your hearts.
Impress them on your children. Talk about them when you sit at home and when you walk along the road, when you lie down and when you get up.

