---
permalink: /
title: ""
excerpt: ""
author_profile: true
redirect_from: 
  - /about/
  - /about.html
---

{% comment %}
Selected Projects / Ongoing Projects 的内容在 _data/selected_projects.yml、ongoing_projects.yml。
手写条目（不用 YAML 时）：删掉对应标题下的 paper-rows 引用行，粘贴 CARD-TEMPLATE.html 里的 HTML。
{% endcomment %}

<span class='anchor' id='about-me'></span>

# Biography

I am **Xinyuan Wang** (王心元), an undergraduate in Robotics at the [University of Michigan](https://umich.edu/). I have worked with [Prof. Jiaoyang Li](https://jiaoyangli.me/) at Carnegie Mellon University, [Dr. Tribhi Kathuria](https://sites.google.com/umich.edu/tribhi-kathuria/home) at the University of Michigan, and [Prof. Zhongqiang Ren](https://rap-lab.github.io/team/zren/) at Shanghai Jiao Tong University.

I’m interested in algorithmic robotics, particularly motion planning for multi-robot and human-interactive environments. I leverage tools in optimization, search, and learning to help robots coordinate efficiently and reliably with one another and with people.

<span class='anchor' id='-educations'></span>
# Educations

- *2025.08 — 2027.06*, B.S.E. in Robotics, [University of Michigan, Ann Arbor](https://umich.edu/).
- *2023.09 — 2027.08*, B.S.E. in Electrical and Computer Engineering, [Shanghai Jiao Tong University](https://en.sjtu.edu.cn/).

{% comment %} News 暂时隐藏：要恢复就删掉这一行和下面的 endcomment，并恢复 _data/navigation.yml 里的 News。
<span class='anchor' id='-news'></span>
# News

- 2004.09.25: I am born!

<!-- - *2025.05*: Academic homepage launched at [lemonyuanyuan.github.io/portfolio/](https://lemonyuanyuan.github.io/portfolio/).
- *TODO*: Add your latest news here (paper accepted, internship, etc.). -->
{% endcomment %}

<span class='anchor' id='-selected-projects'></span>
# Selected Projects

{% include paper-rows.html items=site.data.selected_projects %}

<span class='anchor' id='-ongoing-projects'></span>
# Ongoing Projects

{% include paper-rows.html items=site.data.ongoing_projects %}

<span class='anchor' id='-miscellaneous'></span>
# Miscellaneous

## Teaching

- *2026.09 — Present* — Instructional Aide, ROB 320, University of Michigan.

## Service

- *2026.05* — Journal Reviewer, *Bioinspiration & Biomimetics*.

<div class="page-coda">
  <p class="page-coda__quote">“Keeps me searching for a heart of gold”</p>
  <a class="page-coda__link" href="https://lemonyuanyuan.github.io">Visit my personal website</a>
</div>
