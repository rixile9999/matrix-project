case class ScriptRNG(vs: Vector[Int], i: Int = 0) extends RNG:
  def nextInt: (Int, RNG) = (vs(i % vs.size), ScriptRNG(vs, i + 1))

def scriptRng(vs: Int*): ScriptRNG = ScriptRNG(vs.toVector)

def seeds: scala.List[SimpleRNG] = (1L to 300L).toList.map(s => SimpleRNG(s * 1000003L * 1000003L))

@main def tests(): Unit =
  val v = Vector(1, 2)
  Judge.check("flatMap: 다음 값이 앞 값에 의존")(flatMap(int)(a => map(int)(b => (a, b)))(ScriptRNG(v)), ((1, 2), ScriptRNG(v, 2)))
  Judge.check("flatMap: g 가 unit 이면 RNG 는 f 만큼만")(flatMap(int)(a => unit(a + 100))(ScriptRNG(v)), (101, ScriptRNG(v, 1)))
  Judge.check("flatMap: unit 에 unit")(flatMap(unit(3))(a => unit(a * 2))(ScriptRNG(v)), (6, ScriptRNG(v)))
  val w = Vector(Int.MaxValue, 4)
  Judge.check("nonNegativeLessThan: 치우친 구간은 버리고 다시 뽑는다")(nonNegativeLessThan(10)(ScriptRNG(w)), (4, ScriptRNG(w, 2)))
  Judge.check("nonNegativeLessThan: 받아들이는 경우는 한 번만 뽑는다")(nonNegativeLessThan(10)(scriptRng(13)), (3, ScriptRNG(Vector(13), 1)))
  val x = Vector(Int.MinValue, 5)
  Judge.check("nonNegativeLessThan: Int.MinValue 는 Int.MaxValue 로 바뀌어 버려진다")(nonNegativeLessThan(10)(ScriptRNG(x)), (5, ScriptRNG(x, 2)))
  Judge.check("nonNegativeLessThan(6): 항상 0..5, 모든 값이 나온다")(seeds.map(r => nonNegativeLessThan(6)(r)._1).toSet, scala.collection.immutable.Set(0, 1, 2, 3, 4, 5))
