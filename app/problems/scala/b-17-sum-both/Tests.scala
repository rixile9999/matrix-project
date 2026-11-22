@main def tests(): Unit =
  Judge.check("둘 다 있음")(sumBoth(Some(2), Some(3)), Some(5))
  Judge.check("왼쪽만 있음")(sumBoth(Some(2), None), None)
  Judge.check("오른쪽만 있음")(sumBoth(None, Some(3)), None)
  Judge.check("둘 다 없음")(sumBoth(None, None), None)
  Judge.check("0과 음수")(sumBoth(Some(0), Some(-4)), Some(-4))
