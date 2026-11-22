@main def tests(): Unit =
  Judge.check("1..5의 분산")(variance(Seq(1.0, 2.0, 3.0, 4.0, 5.0)), Some(2.0))
  Judge.check("빈 시퀀스")(variance(Seq.empty[Double]), None)
  Judge.check("원소 하나")(variance(Seq(42.0)), Some(0.0))
  Judge.check("모두 같은 값")(variance(Seq(3.0, 3.0, 3.0)), Some(0.0))
  Judge.check("2,4,4,4,5,5,7,9")(variance(Seq(2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0)), Some(4.0))
