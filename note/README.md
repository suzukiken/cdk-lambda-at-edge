+++
title = "URLで指定した縦横幅に画像を縮小するLambda@Edge"
date = "2021-05-02"
tags = ["Lambda@Edge", "Lambda", "CloudFront", "Route 53"]
+++

随分前に作ったものなのであまり覚えていないけど結構苦労したやつ。今作り直すとしたらもう少し違うコードになるのかもしれない。

[Githubのリポジトリ](https://github.com/suzukiken/cdklambdaatedge)

Lambda@Edgeがちょっと普通のLambdaと違うのはデプロイするバージョンを指定する必要があるということで、そのため`cdk destroy`するときに手間がかかる。具体的にはそのバージョンを削除する作業をして、それが反映されるのをしばらく待つことになる。これについてはCDKの中で削除するような指定が可能なののかもしれないけど自分はそれを知らない。

なお自分がアップしているGithubのリポジトリは基本的にpush前に`cdk deploy`と`cdk destroy`をして動作する ことを確認しているのだけど、このリポジトリについては未確認です。いまgithubにpushされているコードは随分前に作った時のCDKのコードを未確認のまま上げています。
