# Gerber Files
In this directory are the gerber files (extension `.zip`) for the PCBs used in this project.

A gerber file is really just a zip file containing all the information necessary for a PCB manufacturer to create your PCB. Any boardhouse will know what to do with a gerber file.

Note, each file will create only a single instance of whatever it contains. So, for example, if you order "a LMM board" from the gerber file, you will get exactly 1 PCB, where a typical set requires 3. So, you will want to make sure your quantities are corrected when ordering.

## Gerber files
  - [LM Board](./LMGerber.zip)
  - [LMM Board](./LMMGerber.zip)
  - [Trigger Board](./TriggerGerber.zip)

## Quantities by Trigger Set

The number of PCBs you need to order depends on how many triggers you are building. There is always 1 LM (main controller) board and 1 LMM (module) board per team. The number of Trigger boards equals the total number of triggers.

| Gerber File | 16 Trigger Set | 12 Trigger Set | 10 Trigger Set | Explanation |
|-------------|:--------------:|:--------------:|:--------------:|-------------|
| [LM Board](./LMGerber.zip) | 1 | 1 | 1 | One per set — the main quiz magistrate controller board |
| [LMM Board](./LMMGerber.zip) | 3 | 3 | 3 | One per team |
| [Trigger Board](./TriggerGerber.zip) | 16 | 12 | 10 | One per trigger |