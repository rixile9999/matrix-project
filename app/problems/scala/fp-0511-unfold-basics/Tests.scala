@main def tests(): Unit =
  Judge.check("fibs")(fibsViaUnfold.take(10).toList, List(0, 1, 1, 2, 3, 5, 8, 13, 21, 34))
  Judge.check("from")(fromViaUnfold(5).take(4).toList, List(5, 6, 7, 8))
  Judge.check("from: 음수에서 시작")(fromViaUnfold(-1).take(3).toList, List(-1, 0, 1))
  Judge.check("constant")(constantViaUnfold("x").take(3).toList, List("x", "x", "x"))
  Judge.check("ones")(onesViaUnfold.take(4).toList, List(1, 1, 1, 1))
  Judge.check("fibs의 40번째 항")(fibsViaUnfold.take(40).toList.last, 63245986)
