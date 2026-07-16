# Third-party notices

PaperLens includes a compact offline dataset derived from
[ECDICT](https://github.com/skywind3000/ECDICT), revision
`bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`. ECDICT is distributed under the
MIT License; its complete license text is included in
`src-tauri/resources/ECDICT-LICENSE.txt` and in installed application resources.

The bundled database retains English headwords, phonetics, Chinese
translations, parts of speech, and inflection-to-lemma mappings. It omits
phrases, examples, audio URLs, and corpus/exam metadata to keep the desktop
package reasonably sized. PaperLens does not contact ECDICT or any dictionary
service to use this built-in dataset.
