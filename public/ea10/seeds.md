# Seeds

Measurements of geometrical properties of kernels belonging to three different varieties of wheat. A soft X-ray technique and GRAINS package were used to construct all seven, real-valued attributes.

Dataset Characteristics
Multivariate

Subject Area
Biology

Associated Tasks
Classification, Clustering

Feature Type
Real

Instances
210

## Additional Information

The examined group comprised kernels belonging to three different varieties of wheat: Kama, Rosa and Canadian, 70 elements each, randomly selected for
the experiment. High quality visualization of the internal kernel structure was detected using a soft X-ray technique. It is non-destructive and considerably cheaper than other more sophisticated imaging techniques like scanning microscopy or laser technology. The images were recorded on 13x18 cm X-ray KODAK plates. Studies were conducted using combine harvested wheat grain originating from experimental fields, explored at the Institute of Agrophysics of the Polish Academy of Sciences in Lublin.

The data set can be used for the tasks of classification and cluster analysis.

## Additional Variable Information

Für die anstehende Einsendeaufgabe soll “Seeds” als Beispiel für einen höher-dimensionaleren Datensatz vorgestellt werden. Im Seeds Datensatz werden je 70 Körner von drei Weizensorten (Kama, Rosa and Canadian) untersucht. Über ein bildgebendes Verfahren (Röntgentechnik) wurden die folgenden 7 Attribute für jedes Weizenkorn gemessen und berechnet:

Bereich/Flächeninhalt A (engl. area)
Umfang P (engl. perimeter)
Kompaktheit C = 4*pi*A/P^2, (engl. compactness)
Länge des Kerns (engl. length of kernel)
Breite des Kerns (engl. width of kernel)
Asymmetriekoeffizient (engl. asymmetry coefficient)
Länge der Kernnut (engl. length of kernel groove)
Alle 7 Attribute sind reellwertig. Anhand der Attribute sollten die Körner den verschiedenen Weizensorten zugeordnet werden können. Es handelt sich also um ein Klassifikationsproblem mit drei Klassen und einem sieben-dimensionalen Input.

Im Folgenden sehen Sie einen Ausschnitt aus dem Datensatz (seeds_dataset.txt), die letzte Zahl ist der Klassen-Label:

15.26   14.84  0.871  5.763  3.312  2.221  5.22   1
14.88  14.57  0.8811 5.554  3.333  1.018  4.956  1
14.29  14.09  0.905  5.291  3.337  2.699  4.825  1
…
17.63   15.98  0.8673 6.191  3.561  4.076  6.06   2
16.84  15.67  0.8623 5.998  3.484  4.675  5.877  2
17.26  15.73  0.8763 5.978  3.594  4.539  5.791  2
…
13.34   13.95  0.862  5.389  3.074  5.995  5.307  3
12.22  13.32  0.8652 5.224  2.967  5.469  5.221  3
11.82  13.4   0.8274 5.314  2.777  4.471  5.178  3