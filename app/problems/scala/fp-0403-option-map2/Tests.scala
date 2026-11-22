@main def tests(): Unit =
  Judge.check("둘 다 Some")(map2(Some(2), Some(3))(_ + _), Some(5))
  Judge.check("다른 타입 결합")(map2(Some("나이"), Some(7))((s, n) => s + n), Some("나이7"))
  Judge.check("앞이 None")(map2(None: Option[Int], Some(3))(_ + _), None)
  Judge.check("뒤가 None")(map2(Some(2), None: Option[Int])(_ + _), None)
  Judge.check("둘 다 None")(map2(None: Option[Int], None: Option[Int])(_ + _), None)
  Judge.check("None이면 f를 호출하지 않음")(map2(Some(1), None: Option[Int])((_, _) => throw new Exception("호출됨")), None)
