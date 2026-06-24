

Pasted text(297).txt
Document

This is almost certainly one bad line of text in CourseNotes.tsx, not 150 separate TypeScript errors.

The giveaway is:

Errors are concentrated on line 174

Then line 177

Then line 181

Then line 187

Repeated TS1127: Invalid character

Repeated TS1005: ',' expected

That pattern happens when a large object or array contains copied text with smart quotes, invisible Unicode characters, or improperly escaped line breaks.

What probably happened
You likely pasted notes that contain something like:

content: "This is a note \n
Another line"
or

content: "Don’t forget..."
(where the apostrophe is a smart quote)

or

content: "Line one
Line two"
inside a normal quoted string.

TypeScript then loses its place and reports hundreds of errors afterward.

Open src/CourseNotes.tsx
Go directly to:

Line 174
Line 177
Line 181
Line 187
Look for any of these:

Bad
text: "This is line 1
This is line 2"
Good
text: `This is line 1
This is line 2`
or

text: "This is line 1\nThis is line 2"
Also search for
“
”
’
•
→
Replace them with:

"
"
'
-
->
These often cause TS1127 when pasted from Word, PDFs, ChatGPT, or course materials.

Fastest way to find it
In VS Code:

Open CourseNotes.tsx

Press Ctrl+G

Enter:

174
Look at that entire line.

If it's a huge object, expand around lines 170–190.

I would bet money that one of those course note entries contains a pasted paragraph with an unescaped quote or newline. The build log shows the parser first breaks at line 174 and everything after that cascades. Pasted text.txt

If you paste lines 160–190 of CourseNotes.tsx, I can pinpoint the exact character causing the build failure.



CourseNotes.tsx
TypeScript

I found the problem.

Your file has literal \n characters outside of strings, which means a large chunk of JSON/object data was pasted incorrectly. That's why TypeScript is throwing hundreds of "Invalid character" errors. CourseNotes.tsx

For example, around the C963 section, the file currently contains:

{ type: 'competencies', content: '...' },\n
{ type: 'pacing', content: '...' },\n
{ type: 'structure', content: '...' },\n
Notice those \n sequences after the closing },.

They should be actual newlines in the file, not the characters \ and n.

What happened
It looks like part of the course data was generated/exported as escaped JSON and then pasted directly into the TypeScript object.

Instead of:

],
'C963': [
  { ... },
  { ... },
],
the file contains:

],\n
'C963': [\n
  { ... },\n
which is invalid TypeScript. CourseNotes.tsx

Fast fix
In VS Code:

Open CourseNotes.tsx

Press Ctrl + H

Enable Regex (.*)

Find:

\\n
Replace with:

(an actual blank line)

Then review the file before saving.

Even better
The corruption appears to start around the C963 course and continues through many later courses. The safest fix is:

Revert CourseNotes.tsx to the last working commit.

Re-add the new course notes.

Or paste the entire file through a formatter/JSON validator before inserting it into the TypeScript object.

The build errors at lines 174, 177, 181, 187 are just where the parser finally gives up—the actual corruption is the escaped \n text scattered throughout the course definitions. CourseNotes.tsx

If you upload the current GitHub version or paste the section from line 173 through the end of PRELOADED_NOTES, I can clean it and give you a corrected replacement block.



Library
/
CourseNotes.tsx
More actions
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
// src/CourseNotes.tsx
//
// Work tab: BSCSIA Course Notes reference tool.
// - Dropdown to select a course
// - Pre-loaded structured notes from Kaylee's course notes + degree plan
// - Add-a-note section that auto-organizes into bullet categories
// - All notes stored in Supabase course_notes table

import { useCallback, useEffect, useState } from 'react';
import { Plus, Save, ChevronDown, BookOpen, X, RefreshCw, FileText } from 'lucide-react';
import { supabase } from './lib/supabase';

// -- Types ------------------------------------------------------------------

type NoteType = 'general' | 'pacing' | 'structure' | 'cert' | 'student_tips' | 'resources' | 'prereqs' | 'competencies';

interface CourseNote {
  id: string;
  course_code: string;
  note_type: NoteType;
  content: string;
  created_at: string;
  updated_at: string;
}

// -- Course catalog from BSCSIA 202509 degree plan --------------------------

const COURSES: { code: string; title: string; term: number; cert?: string; type: string; cu: number }[] = [
  { code: 'PROGRAM', title: 'Program Overview -- All Certs & Stackables', term: 0, type: 'Reference', cu: 0 },
  { code: 'C458',  title: 'Health, Fitness, and Wellness',             term: 1, type: 'OA', cu: 4 },
  { code: 'D322',  title: 'Introduction to IT',                        term: 1, type: 'OA', cu: 4 },
  { code: 'C683',  title: 'Natural Science Lab',                       term: 1, type: 'PA', cu: 2 },
  { code: 'D685',  title: 'Practical Applications of Prompt',          term: 1, type: 'OA', cu: 2 },
  { code: 'D333',  title: 'Ethics in Technology',                      term: 2, type: 'PA', cu: 3 },
  { code: 'D316',  title: 'IT Foundations',                            term: 2, type: 'Cert', cu: 4, cert: 'CompTIA A+ Core 1' },
  { code: 'C955',  title: 'Applied Probability and Statistics',        term: 2, type: 'OA', cu: 3 },
  { code: 'D270',  title: 'Composition - Successful Self-Expression',  term: 2, type: 'PA', cu: 3 },
  { code: 'C957',  title: 'Applied Algebra',                           term: 3, type: 'OA', cu: 3 },
  { code: 'D317',  title: 'IT Applications',                           term: 3, type: 'Cert', cu: 4, cert: 'CompTIA A+ Core 2' },
  { code: 'D827',  title: 'Fundamentals of Information Security',      term: 3, type: 'OA', cu: 3 },
  { code: 'D315',  title: 'Network and Security - Foundations',        term: 3, type: 'OA', cu: 3 },
  { code: 'D265',  title: 'Critical Thinking: Reason and Evidence',   term: 4, type: 'PA', cu: 3 },
  { code: 'D325',  title: 'Networks',                                  term: 4, type: 'Cert', cu: 4, cert: 'CompTIA Network+' },
  { code: 'D268',  title: 'Intro to Communication: Connecting with Others', term: 4, type: 'PA', cu: 3 },
  { code: 'D336',  title: 'Business of IT - Applications',            term: 4, type: 'Cert', cu: 4, cert: 'Axelos ITIL' },
  { code: 'C963',  title: 'American Politics and the US Constitution', term: 5, type: 'PA', cu: 3 },
  { code: 'D420',  title: 'Discrete Math: Logic',                     term: 5, type: 'OA', cu: 1 },
  { code: 'D329',  title: 'Network and Security - Applications',      term: 5, type: 'Cert', cu: 4, cert: 'CompTIA Security+' },
  { code: 'D828',  title: 'Legal Issues in Information Security',     term: 5, type: 'PA', cu: 4 },
  { code: 'D829',  title: 'Digital Forensics in Cybersecurity',       term: 6, type: 'PA', cu: 4 },
  { code: 'C845',  title: 'Information Systems Security',             term: 6, type: 'PA', cu: 4, cert: 'SSCP (optional voucher)' },
  { code: 'D324',  title: 'Business of IT - Project Management',     term: 6, type: 'Cert', cu: 4, cert: 'CompTIA Project+' },
  { code: 'D421',  title: 'Discrete Math: Functions and Relations',   term: 7, type: 'OA', cu: 1 },
  { code: 'D422',  title: 'Discrete Math: Algorithms and Cryptography', term: 7, type: 'OA', cu: 1 },
  { code: 'D830',  title: 'Introduction to Cryptography',             term: 7, type: 'OA+PA', cu: 4 },
  { code: 'D832',  title: 'Managing Information Security',            term: 7, type: 'PA', cu: 3 },
  { code: 'D278',  title: 'Scripting and Programming - Foundations', term: 7, type: 'OA', cu: 3 },
  { code: 'D281',  title: 'Linux Foundations',                        term: 8, type: 'Cert', cu: 3, cert: 'LPI Linux Essentials' },
  { code: 'D426',  title: 'Data Management - Foundations',            term: 8, type: 'OA', cu: 3 },
  { code: 'D522',  title: 'Python for IT Automation',                 term: 8, type: 'OA', cu: 3 },
  { code: 'D492',  title: 'Data Analytics - Applications',            term: 8, type: 'Cert', cu: 4, cert: 'CompTIA Data+' },
  { code: 'D385',  title: 'Software Security and Testing',            term: 9, type: 'PA', cu: 3 },
  { code: 'D831',  title: 'Introduction to AI and Security',          term: 9, type: 'OA', cu: 2 },
  { code: 'D340',  title: 'Cyber Defense and Countermeasures',        term: 9, type: 'Cert', cu: 4, cert: 'CompTIA CySA+' },
  { code: 'D320',  title: 'Managing Cloud Security',                  term: 9, type: 'OA', cu: 4, cert: 'CCSP (optional voucher)' },
  { code: 'D332',  title: 'Penetration Testing and Vulnerability Analysis', term: 10, type: 'Cert', cu: 4, cert: 'CompTIA PenTest+' },
  { code: 'D833',  title: 'Cybersecurity and Information Assurance Capstone', term: 10, type: 'PA', cu: 4 },
];

// -- Pre-loaded notes from Kaylee's course notes document ------------------

const PRELOADED_NOTES: Record<string, { type: NoteType; content: string }[]> = {
  'PROGRAM': [
    { type: 'general', content: '- 122 total CUs across 38 courses\n- 10 terms of 6 months each\n- Minimum 12 CUs per term required\n- Competency-based: degree earned by demonstrating skills, not seat time\n- Must complete 66.67% of attempted units to maintain SAP\n- First term: must pass at least 3 CUs to maintain financial aid eligibility' },
    { type: 'cert', content: ' CERTS INCLUDED IN BSCSIA 202509:\n- CompTIA A+ Core 1 (D316) -- Webcam/PearsonVUE\n- CompTIA A+ Core 2 (D317) -- Webcam/PearsonVUE\n- CompTIA Network+ (D325) -- Webcam/PearsonVUE\n- CompTIA Security+ (D329) -- TEST CENTER ONLY\n- Axelos ITIL Foundation (D336) -- PeopleSoft\n- CompTIA Project+ (D324) -- Webcam/PearsonVUE\n- LPI Linux Essentials (D281) -- Webcam/PearsonVUE\n- ISC2 SSCP (C845) -- optional voucher, PearsonVUE\n- CompTIA Data+ (D492) -- Webcam/PearsonVUE\n- CompTIA CySA+ (D340) -- Webcam/PearsonVUE\n- ISC2 CCSP (D320) -- optional voucher, PearsonVUE\n- CompTIA PenTest+ (D332) -- Webcam/PearsonVUE' },
    { type: 'cert', content: ' STACKABLE CERTS (earned automatically by CompTIA):\n- CompTIA IT Operations Specialist = A+ Core 1 + A+ Core 2\n- CompTIA Secure Infrastructure Specialist = A+ Core 1 + A+ Core 2 + Network+\n- CompTIA Network Vulnerability Assessment Professional = Network+ + Security+ + PenTest+\n- CompTIA Network Security Professional = Network+ + Security+ + PenTest+ + CySA+\n- CompTIA Security Analytics Professional = Security+ + CySA+' },
  ],
