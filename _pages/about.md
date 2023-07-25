---
permalink: /
title: ""
excerpt: ""
author_profile: true
redirect_from: 
  - /about/
  - /about.html
---

{% if site.google_scholar_stats_use_cdn %}
{% assign gsDataBaseUrl = "https://cdn.jsdelivr.net/gh/" | append: site.repository | append: "@" %}
{% else %}
{% assign gsDataBaseUrl = "https://raw.githubusercontent.com/" | append: site.repository | append: "/" %}
{% endif %}
{% assign url = gsDataBaseUrl | append: "google-scholar-stats/gs_data_shieldsio.json" %}

<span class='anchor' id='about-me'></span>

# 👤 Short Bio
***Jiayi Wu*** is a member of the [RoboPI](https://robopi.ece.ufl.edu/people.html#Grad) lab, he is a master’s student(thesis) in ECE Department of the University of Florida. His research focus is on low-cost 3D reconstruction and depth estimation in scattering medium. He is currently working on wraping up his master thesis project under the supervision of Prof. Islam. The primaly research goal of his thesis is to formulate a fast and robust underwater 3D reconstruction algorithm based on the fusion of SfM algorithm and deep learning. He is also collaboraing with other students across the lab to make it lightweight and deployable on low-power robotic systems. <a href='https://scholar.google.com/citations?user=xoZE1GsAAAAJ&hl'><img src="https://img.shields.io/endpoint?url={{ url | url_encode }}&logo=Google%20Scholar&labelColor=f6f6f6&color=9cf&style=flat&label=citations"></a>.

***My research interest includes:***
- General Environment Vision: Make computer vision systems more robust to the environment (scattering media, bad weather)
- Low-cost 3D reconstruction and depth estimation in scattering medium
- The application of computer vision in the medical field (including but not limited to medical image processing, pathological image segmentation, image enhancement)
- AI-based Surgical Navigation: Make AI have the ability to generate structured diagnostic reports through medical images, and combine NLP algorithms and computer vision technology to achieve surgical navigation
- Surgical robot: Enable surgical robots to have accurate multi-modal fusion perception ability and precise motion control and can perform precise surgery according to the instructions analyzed by doctors or AI

[***Latest CV's link***](/pdf/PhD Application-CV(latest version)-Jiayi Wu.pdf)

# 📰 News

- 2023/06/06: ***Our paper “3D Reconstruction of Underwater Scenes using Nonlinear Domain Projection” won Best Paper Award at the IEEE Conference on Artificial Intelligence (IEEE CAI) 2023, Santa Clara, California !!!***

- 2023/05/01: ***Our paper “3D Reconstruction of Underwater Scenes using Nonlinear Domain Projection” has been accepted by IEEE Conference on Artificial Intelligence (IEEE CAI) 2023 !!!***

- 2023/04/03: ***Our paper “VALIDATION OF A FULL-WAVE BACKSCATTER MODEL FOR CORN FIELDS USING MEASUREMENTS FROM A GROUND-BASED SCATTEROMETER” has been accepted by IGARSS 2023 !!!***

<!-- - 2023/02/15: The journal [“3D Reconstruction of Underwater Scenes using Nonlinear Domain Projection”](https://youtu.be/roiOpPyAvZ0) was submitted to IEEE TCSVT. -->

- 2023/01/16: ***Our paper [“UDepth: Fast Monocular Depth Estimation for Visually-guided Underwater Robots”](https://ieeexplore.ieee.org/abstract/document/10161471) has been accepted by ICRA 2023 !!!***

- 2022/09/15: The paper [“UDepth: Fast Monocular Depth Estimation for Visually-guided Underwater Robots”](https://arxiv.org/abs/2209.12358) I collaborated with Boxiao Yu and Prof. Islam was submitted to ICRA 2023.

- 2022/08/23: Completed the summer internship at Vobile and got a return offer (recommended by Dr. Zhao).

- 2022/05/23: Joined the team of Dr. Zhao (CTO of Vobile) of Vobile as an audio and video algorithm development engineer (summer internship).

- 2022/01/10: Join Professor Judge's Remote Sensing Lab (as Graduate Student Assistant) and be responsible for the development of a large-scale automated generation of 3D plant models.

# 🎓 Educations 
><a href="https://www.ece.ufl.edu/"><img class="svg" src="/images/UFL_logo.png" width="45pt"></a>  ***University of Florida***
>>- ***M.S.[(Thesis)](https://ufdc.ufl.edu/UFE0059937/00001/pdf) in Electrical and Computer Engineering*** --------- *Aug. 2021- Present*  
Supervised by Prof. Islam.

><a href="https://mechanical.zstu.edu.cn/"><img class="svg" src="/images/ZSTU_logo.png" width="45pt"></a>   ***Zhejiang Sci-Tech University (ZSTU)***
>>- ***B.E. in Mechatronic Engineering*** --------- *Sept. 2017- Jun. 2021*  
2021 Outstanding Graduate, Zhejiang Sci-Tech University
 

# 📝 Publications 

### Conference Papers
---
<div class='paper-box'><div class='paper-box-image'><div><div class="badge">CAI 2023 (Best Paper Award)</div><img src='images/SDU_SfM.gif' alt="sym" width="100%"></div></div>
<div class='paper-box-text' markdown="1">

-	`Wu, Jiayi`, Yu, Boxiao, Islam, Md Jahidul. ***3D Reconstruction of Underwater Scenes using Nonlinear Domain Projection***. *IEEE CAI (Best Paper Award)*. 2023  
[[Poster]](https://robopi.ece.ufl.edu/files/pubs/sdu_sfm.pdf) [[Video demo]](https://youtu.be/roiOpPyAvZ0)

</div>
</div>

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">ICRA 2023 (has been accepted)</div><img src='images/udepth.gif' alt="sym" width="100%"></div></div>
<div class='paper-box-text' markdown="1">

-	Yu, Boxiao, `Wu, Jiayi`, Islam, Md Jahidul. ***UDepth: Fast Monocular Depth Estimation for Visually-guided Underwater Robots***. *ICRA*. 2023, pp. 3116-3123, doi: 10.1109/ICRA48891.2023.10161471.  
[[IEEE Xplore]](https://ieeexplore.ieee.org/abstract/document/10161471) [[arXiv]](https://arxiv.org/abs/2209.12358) [[Code]](https://github.com/uf-robopi/UDepth) [[pre-print]](/pdf/2209.12358.pdf)

</div>
</div>

- `Wu, Jiayi`. ***Low-Cost Depth Estimation and 3D Reconstruction in Scattering Medium***. *Master's Thesis*. 2023  
[[UFDC]](https://ufdc.ufl.edu/UFE0059937/00001/pdf)

-	A. Kaleo Roberts, Kamal Sarabandi, Jasmeet Judge, Alejandro Monsivais-Huertero, `Jiayi Wu`. VALIDATION OF A FULL-WAVE BACKSCATTER MODEL FOR CORN FIELDS USING MEASUREMENTS FROM A GROUND-BASED SCATTEROMETER. *IGARSS*. 2023  

# 📃 Projects 

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">A Collaborative Project</div><img src='images/Depth_estimation_project.jpeg' alt="sym" width="100%"></div></div>
<div class='paper-box-text' markdown="1">

### UDepth
- A monocular underwater depth estimation pipeline, using RMI as the input space, constructs a lightweight domain projection module, a lightweight CNN feature extraction module, and a lightweight Transformer-based depth estimation network. And the depth estimation network is supervised with knowledge of underwater light attenuation as a prior. The results show that our depth estimation accuracy is close to the SOTA model, and much faster than them.  
This is a collaborative project on underwater depth estimation with Boxiao Yu, a Ph.D. student in RoboPI lab.  
[[IEEE Xplore]](https://ieeexplore.ieee.org/abstract/document/10161471) [[arXiv]](https://arxiv.org/abs/2209.12358) [[Code]](https://github.com/uf-robopi/UDepth) [[pre-print]](/pdf/2209.12358.pdf)

</div>
</div>

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">Master's Thesis</div><img src='images/FU-SfM_project.png' alt="sym" width="100%"></div></div>
<div class='paper-box-text' markdown="1">

### SDU-SfM
- A fast depth-guided semi-dense underwater 3D reconstruction pipeline without a deep learning model. Underwater image restoration is implemented through RMI channel and underwater imaging model to improve the number of feature matches. Reduce the computational complexity of feature extraction by using the depth map as a mask. In order to achieve higher quality(semi-dense) underwater 3D reconstruction, the depth maps are used as the supervision to refine the 3D point cloud and remove noise.  
This project is my master's thesis, we have submitted a journal to the IEEE Transactions on Artificial Intelligence (TAI). Here is the [video demo](https://youtu.be/roiOpPyAvZ0).  

</div>
</div>

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">R&D Internship Project</div><img src='images/infringing_video_retrieval_project.png' alt="sym" width="100%"></div></div>
<div class='paper-box-text' markdown="1">

### Learning-based Infringing Video Retrieval
- An learning-based infringing video retrieval system based on the fusion of global features and local features. I did a summer internship in the Vobile’s R&D department under the supervision of Dr. Zhao, CTO of Vobile. I built a learning-based infringing video retrieval system based on the fusion of global features and local features. I used Vobile's video database to train the model, and achieved good performance. Before I ended my internship, I put it together into a python package and organize each component in the system into an easy-to-use python toolkit. I also wrote the manual of the package and a document about future optimization steps to finally handed over to the person who took over the project.  

</div>
</div>


# 🏭 Job Experience

- ***Digital Audio and Video Algorithm Engineer*** --------- *May. 2022- Aug. 2022*  
Vobile, Santa Clara, CA, United States.

- ***Graduate Student Assistant*** --------- *Jan. 2022- present*  
Remote Sensing Laboratory at University of Florida, Gainesville, FL, United States.

# 🏅 Honors and Awards

### SCHOLARSHIPS
---
- *2020.12* Zhejiang Government Scholarship
- *2019.09* First Class School Financial Aid for Overseas Exchange Program
- *2018.12* Zhejiang Government Scholarship

### COMPETITIONS
---
- *2021.06* Individual `1st Prize` in the National University Graduate Design Competition (Only two people won this award nationwide) 06/2021
- *2019.10* Provincial `1st Prize` of National 3D Digital Innovative Design Competition
- *2019.09* `2nd Prize` of National 3dds Competition Classic
- *2019.06* `3rd Prize` of The 16th Zhejiang Province Mechanical Design Competition for College Student
- *2019.04* `3rd Prize` of The Challenge Cup Extracurricular Academic Works Competition

# 💬 Academic Services
### Reviewer
---
- 2023 IEEE International Conference on Robotics and Automation (ICRA)
- 2023 IEEE/RSJ International Conference on Intelligent Robots and Systems (IROS 2023) 
