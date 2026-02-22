# Enclosures and Construction Assests
This subdirectory contains all the stl files for the plastic enclosures for the electronics as well as jigs for assembly.

An STL file is the standard format used in the 3d printing world. So, if you are ordering out these parts, you can provide these STLs and
your manufacturer will know what to do with them.

Note, each set of files will create a single instance of whatever you are printing. So, for example, you will need a barrel, cap and stablizer to make 1 trigger. So if you want 16 triggers, you will need 16 stablizers, caps and barrrels.

## STL Files
The STL files for all 3d printed parts can be found in the `stl` folder. Contained are:
  - Enclosures:
    - LM Box:
        - [Top](./stl/LMBottom.stl)
        - [Bottom](./stl/LMBottom.stl)
    - LLM Box:
        - [Top](./stl/LMMTop.stl)
        - [Bottom](./stl/LLMBottom.stl)
    - Trigger:
        - [Barrel](./stl/TriggerBottom.stl)
        - [Cap](./stl/TriggerCap.stl): Important Note! You might need to scale this part up/down by a few percent during slicing so that you achieve an interference fit with the barrel.
        - [Stabilizer](./stl/TriggerStablizer.stl)
  - Jigs: These are optional assembly jigs, which are very nice if you are make many sets all together
    - [Board holder](./stl/LMConstructionBoardHolder.stl): used to hold the PCB in place while soldering.
    - Trigger jig:
        - [Anvil](./stl/TriggerConstructionAnvil.stl): creates a flat surface for the trigger to be pressed against.
        - [Ram](./stl/TriggerConstructionRam.stl): used to press the cap onto the barrel without hurting your hands.

When generating gcode with your slicer, it is recommended to use 0.2mm accuracy, rectilinear infill at 20% and print using PLA. Additionally, the trigger's cap may need to be scaled slightly (a few percent) in your slicer to achieve a good interference fit with the barrel.

## Quantities by Trigger Set

The number of printed parts depends on how many triggers you are building. Enclosure quantities scale with triggers; jigs are optional and quantity depends on your workflow.

### Enclosures

| STL File | 16 Trigger Set | 12 Trigger Set | 10 Trigger Set | Explanation |
|----------|:--------------:|:--------------:|:--------------:|-------------|
| [LM Box Top](./stl/LMTop.stl) | 1 | 1 | 1 | One per set — top half of the main controller enclosure |
| [LM Box Bottom](./stl/LMBottom.stl) | 1 | 1 | 1 | One per set — bottom half of the main controller enclosure |
| [LMM Box Top](./stl/LMMTop.stl) | 3 | 3 | 3 | One per team (3 teams in every configuration) |
| [LMM Box Bottom](./stl/LLMBottom.stl) | 3 | 3 | 3 | One per team (3 teams in every configuration) |
| [Trigger Barrel](./stl/TriggerBottom.stl) | 16 | 12 | 10 | One per trigger |
| [Trigger Cap](./stl/TriggerCap.stl) | 16 | 12 | 10 | One per trigger — may need slight scaling for interference fit |
| [Trigger Stabilizer](./stl/TriggerStablizer.stl) | 16 | 12 | 10 | One per trigger |

### Assembly Jigs (Optional)

| STL File | Suggested Qty | Explanation |
|----------|:-------------:|-------------|
| [Board Holder](./stl/LMConstructionBoardHolder.stl) | 1 | Holds the PCB steady during soldering; one is sufficient for any set size |
| [Trigger Jig Anvil](./stl/TriggerConstructionAnvil.stl) | 1 | Flat surface for pressing caps onto barrels; one is sufficient |
| [Trigger Jig Ram](./stl/TriggerConstructionRam.stl) | 1 | Used with the anvil to press caps without hand strain; one is sufficient |

Contact [the author](https://github.com/jonathanvanschenck/) for further details.

## CAD Files
The full CAD files can be found on onshape:
  - [The main box](https://cad.onshape.com/documents/543b25c417126967cb08de50/v/1616035887736616c0c97bd4/e/729fc64504c2a798e70d9855).
  - [The module](https://cad.onshape.com/documents/a71d7e6c5d369e82da67ce55/v/a1a71b7b6bb9f6b15cbdba2f/e/51fbe87dbc7215f3dbb1e72c).
  - [The trigger](https://cad.onshape.com/documents/fc78aac2c958586ca1177853/w/f2e33e2147721cb4fc4541b8/e/58d502121f0acd43c261de76).
  - [Trigger jig](https://cad.onshape.com/documents/b3dc0fd1912a70c055d7c740/w/58a53ed1eda9de1b411d2abd/e/50ec51447436c03dc649d699)
  - [Board holder jig](https://cad.onshape.com/documents/089ddd3080857b092a4a133b/w/d44446d03ada5b263a56f82f/e/a523e0c8f14e67229ecee9d0)
